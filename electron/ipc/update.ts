import { app, ipcMain, net, shell } from "electron";
import log from "electron-log";

import { isNewerVersion, type UpdateAnnouncement, type UpdateCheckResult, type UpdateManifest } from "@shared/update";

import { channel } from "./channel";

/**
 * 更新检查。
 *
 * 数据源是仓库根目录的 `latest.json`，两个地址按顺序试：
 *   1. jsDelivr（国内通常比 raw.githubusercontent 稳，且带 CDN 缓存）
 *   2. GitHub Raw
 * 两个都失败就返回 ok=false，界面上给一句「检查失败，可手动去 Releases 看看」。
 *
 * 这里用 Electron 的 `net.fetch` 而不是 node 的全局 fetch ——
 * 前者走的是 Chromium 的会话，会带上「设置 → 代理设置」里配的代理；
 * 后者完全绕过代理，国内不开代理时大概率连不上。
 */

const REPO = "Zuo-CNSD/NWBP";

const MANIFEST_SOURCES: { label: string; url: string }[] = [
  { label: "jsDelivr", url: `https://cdn.jsdelivr.net/gh/${REPO}@main/latest.json` },
  { label: "GitHub Raw", url: `https://raw.githubusercontent.com/${REPO}/main/latest.json` },
];

/** 单次请求超时。检查更新是启动路径上的事，不能拖住界面 */
const TIMEOUT_MS = 8000;
/** 缓存多久。同一进程内重复点「检查更新」没必要每次都打网络 */
const CACHE_TTL_MS = 30 * 60 * 1000;

let cache: { result: UpdateCheckResult; at: number } | null = null;

const sanitizeAnnouncements = (input: unknown): UpdateAnnouncement[] => {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is UpdateAnnouncement => Boolean(item && typeof item === "object"))
    .filter(item => typeof item.id === "string" && typeof item.title === "string")
    .map(item => ({
      id: item.id,
      title: item.title,
      level: item.level === "warning" || item.level === "maintenance" ? item.level : "info",
      body: typeof item.body === "string" ? item.body : undefined,
      date: typeof item.date === "string" ? item.date : undefined,
      // 只放 https 链接：公告里的链接会被直接 shell.openExternal 打开
      link: typeof item.link === "string" && /^https:\/\//i.test(item.link) ? item.link : undefined,
    }));
};

const fetchManifest = async (url: string): Promise<UpdateManifest> => {
  const response = await net.fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // 加个时间戳绕开中间层缓存，但保留 jsDelivr 自己的 CDN 缓存语义由 max-age 控制
    cache: "no-cache",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  const parsed = JSON.parse(text) as UpdateManifest;
  if (!parsed || typeof parsed !== "object") throw new Error("清单格式不对");
  return parsed;
};

export const checkForUpdate = async (force = false): Promise<UpdateCheckResult> => {
  const currentVersion = app.getVersion();
  const now = Date.now();

  if (!force && cache && now - cache.at < CACHE_TTL_MS) {
    return cache.result;
  }

  let lastError = "网络请求失败";

  for (const source of MANIFEST_SOURCES) {
    try {
      const manifest = await fetchManifest(source.url);
      const release = manifest.release;
      if (!release?.version) throw new Error("清单里没有版本号");

      const result: UpdateCheckResult = {
        ok: true,
        currentVersion,
        hasUpdate: isNewerVersion(release.version, currentVersion),
        release,
        announcements: sanitizeAnnouncements(manifest.announcements),
        source: source.label,
        checkedAt: new Date(now).toISOString(),
      };

      cache = { result, at: now };
      log.info(`[update] 检查完成：本地 ${currentVersion} / 远端 ${release.version}（${source.label}）`);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      log.warn(`[update] ${source.label} 拉取失败：${lastError}`);
    }
  }

  return {
    ok: false,
    currentVersion,
    hasUpdate: false,
    announcements: [],
    checkedAt: new Date(now).toISOString(),
    error: lastError,
  };
};

/**
 * 打开下载链接。
 *
 * 清单里的地址是"我们自己写的内容"，但它终究是网络下发的一段字符串，
 * 所以这里仍然过一道：只放行 https，其它一律拒绝。
 * 返回 false 时界面会提示「链接不可用」，而不是静默失败。
 */
const openDownload = async (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    await shell.openExternal(parsed.toString());
    return true;
  } catch {
    return false;
  }
};

export function registerUpdateHandlers() {
  ipcMain.handle(channel.update.check, async (_event, force?: boolean) => checkForUpdate(Boolean(force)));
  ipcMain.handle(channel.update.openDownload, async (_event, url: string) => openDownload(url));
}
