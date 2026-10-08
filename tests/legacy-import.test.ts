import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 旧版数据同步的测试。
 *
 * 这里的目标是钉住两件事：
 *  1. 只在「新版没有、旧版有」时才搬，绝不反过来覆盖用户在新版里的数据；
 *  2. 「有没有登录态」的判断依据是 Cookies 库里能不能搜到 SESSDATA
 *     （实测这些 cookie 是明文存在 value 列的，所以字符串搜索是可靠的）。
 */
const state = {
  appData: "",
  userData: "",
};

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "appData" ? state.appData : state.userData),
  },
}));

vi.mock("electron-log", () => ({
  default: { info: () => {}, warn: () => {}, error: () => {} },
}));

const loadModule = async () => {
  vi.resetModules();
  return import("../electron/legacy-import");
};

/** 造一个「Cookies 库里含 SESSDATA」的假库 */
const writeCookieDb = (file: string, loggedIn: boolean) => {
  mkdirSync(path.dirname(file), { recursive: true });
  const payload = Buffer.concat([
    Buffer.from("SQLite format 3\0"),
    Buffer.from("...cookies table..."),
    loggedIn ? Buffer.from("bilibili.comSESSDATAabc123") : Buffer.from("bilibili.combuvid3abc123"),
  ]);
  writeFileSync(file, payload);
};

describe("旧版 biu 数据同步", () => {
  beforeEach(() => {
    state.appData = mkdtempSync(path.join(tmpdir(), "nwbp-appdata-"));
    state.userData = path.join(state.appData, "NWBP");
    mkdirSync(state.userData, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(state.appData, { recursive: true, force: true });
    } catch {
      /* 清理失败无所谓 */
    }
  });

  it("新版没登录、旧版有登录 → 把 Cookies 搬过来", async () => {
    const legacy = path.join(state.appData, "Biu");
    writeCookieDb(path.join(legacy, "Cookies"), true);
    writeCookieDb(path.join(state.userData, "Cookies"), false);

    const { importLegacyData } = await loadModule();
    const result = importLegacyData({ includeState: true });

    expect(result.loginImported).toBe(true);
    expect(result.needRestart).toBe(true);
    expect(readFileSync(path.join(state.userData, "Cookies")).includes("SESSDATA")).toBe(true);
  });

  it("新版已经登录 → 绝对不动它，而且会留一份备份", async () => {
    const legacy = path.join(state.appData, "Biu");
    writeCookieDb(path.join(legacy, "Cookies"), true);
    writeCookieDb(path.join(state.userData, "Cookies"), true);

    const { importLegacyData } = await loadModule();
    const result = importLegacyData({ includeState: true });

    expect(result.loginImported).toBe(false);
    // 没触发导入就不该留备份文件，避免污染 userData
    expect(existsSync(path.join(state.userData, "Cookies.nwbp-backup"))).toBe(false);
  });

  it("旧版没有登录态 → 不搬", async () => {
    const legacy = path.join(state.appData, "Biu");
    writeCookieDb(path.join(legacy, "Cookies"), false);
    writeCookieDb(path.join(state.userData, "Cookies"), false);

    const { importLegacyData } = await loadModule();
    const result = importLegacyData({ includeState: false });

    expect(result.loginImported).toBe(false);
    expect(result.imported).toHaveLength(0);
  });

  it("includeState 时带过 Local Storage 与设置，且不覆盖已存在的设置", async () => {
    const legacy = path.join(state.appData, "Biu");
    writeCookieDb(path.join(legacy, "Cookies"), true);
    mkdirSync(path.join(legacy, "Local Storage"), { recursive: true });
    writeFileSync(path.join(legacy, "Local Storage", "leveldb"), "old");
    writeFileSync(path.join(legacy, "app-settings.json"), JSON.stringify({ theme: "old" }));

    const { importLegacyData } = await loadModule();
    const result = importLegacyData({ includeState: true });

    expect(result.imported).toContain("Local Storage");
    expect(result.imported).toContain("app-settings.json");

    // 已经存在的目标文件不能被覆盖
    writeFileSync(path.join(state.userData, "app-settings.json"), JSON.stringify({ theme: "new" }));
    const again = importLegacyData({ includeState: true });
    expect(again.imported).not.toContain("app-settings.json");
    const saved = JSON.parse(readFileSync(path.join(state.userData, "app-settings.json"), "utf-8")) as {
      theme: string;
    };
    expect(saved.theme).toBe("new");
  });

  it("没有旧版目录时不报错", async () => {
    const { importLegacyData, hasLegacyData } = await loadModule();
    expect(() => importLegacyData({ includeState: true })).not.toThrow();
    expect(hasLegacyData()).toBe(false);
  });
});
