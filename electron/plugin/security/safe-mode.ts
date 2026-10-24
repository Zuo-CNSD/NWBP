import log from "electron-log";
import fs from "node:fs";
import path from "node:path";

import { getUserDataPath } from "../../utils";

/**
 * 安全模式。
 *
 * 要解决的问题很具体：**装了个插件之后应用打不开了**。
 * 这种情况下用户连设置页都进不去，没法关插件 —— 所以必须由启动流程自己兜底。
 *
 * 判定方式：每次启动先记一笔「启动尝试」，跑稳一段时间后再清零。
 * 连续两次没跑到「稳」的启动，就认为上次是被插件搞死的，这一次不加载任何插件。
 * 用「连续失败」而不是「上次失败」，是为了避免一次偶发（比如用户强杀进程）就误判。
 *
 * 另外两条入口：
 *   - `NWBP --safe-mode` 启动参数，给「已经打不开、但有终端」的人用；
 *   - 设置页的「重启并禁用全部插件」。
 */

const STATE_FILE = "plugin-safe-mode.json";
/** 启动多久算「稳」——太短容易把慢机器误判，太长用户会觉得「怎么又坏了」 */
const STABLE_AFTER_MS = 20_000;
const FAILURE_THRESHOLD = 2;

interface SafeModeState {
  bootAttempts: number;
  lastBootAt: number;
  /** 用户主动进安全模式（跨启动保持，直到手动解除） */
  forced: boolean;
}

const file = () => path.join(getUserDataPath(), STATE_FILE);

const read = (): SafeModeState => {
  try {
    const raw = fs.readFileSync(file(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<SafeModeState>;
    return {
      bootAttempts: Number(parsed.bootAttempts) || 0,
      lastBootAt: Number(parsed.lastBootAt) || 0,
      forced: parsed.forced === true,
    };
  } catch {
    return { bootAttempts: 0, lastBootAt: 0, forced: false };
  }
};

const write = (state: SafeModeState) => {
  try {
    fs.writeFileSync(file(), JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    log.error("[plugin] 写安全模式状态失败:", error);
  }
};

let active = false;
let reason: "crash-loop" | "flag" | "manual" | null = null;
let stableTimer: NodeJS.Timeout | null = null;

/** 启动时调一次：决定这次要不要跳过所有插件 */
export const beginBoot = (argv: string[] = process.argv): boolean => {
  const state = read();
  const forced = state.forced || argv.includes("--safe-mode");

  state.bootAttempts += 1;
  state.lastBootAt = Date.now();
  write(state);

  if (argv.includes("--safe-mode")) {
    active = true;
    reason = "flag";
  } else if (forced) {
    active = true;
    reason = "manual";
  } else if (state.bootAttempts > FAILURE_THRESHOLD) {
    active = true;
    reason = "crash-loop";
  }

  if (active) log.warn(`[plugin] 安全模式生效（${reason}），本次不加载任何插件`);
  return active;
};

/** 跑稳了：清零失败计数。重复调用无副作用。 */
export const markStable = () => {
  if (stableTimer) return;
  stableTimer = setTimeout(() => {
    const state = read();
    if (state.bootAttempts === 0) return;
    write({ ...state, bootAttempts: 0 });
    log.info("[plugin] 启动稳定，已清零失败计数");
  }, STABLE_AFTER_MS);
  // 别让这个定时器拖着进程不退出
  stableTimer.unref?.();
};

export const isSafeMode = () => active;
export const safeModeReason = () => reason;

/** 用户主动「重启进安全模式」：写标记，下次启动生效 */
export const requestSafeModeNextBoot = () => {
  write({ ...read(), forced: true, bootAttempts: 0 });
};

/** 解除：清掉标记，下次正常加载 */
export const clearSafeMode = () => {
  write({ ...read(), forced: false, bootAttempts: 0 });
  active = false;
  reason = null;
};
