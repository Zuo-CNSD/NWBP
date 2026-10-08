import { app } from "electron";
import log from "electron-log";
import fs from "node:fs";
import path from "node:path";

/**
 * 把旧版 Biu 的登录态同步到 NWBP。
 *
 * 为什么不能只靠「复制整个 userData 目录」：
 * B 站的登录凭据（SESSDATA / DedeUserID / bili_jct）存在 Chromium 的
 * `Cookies` SQLite 库里，不在 electron-store 里。而改名 Biu → NWBP 之后
 * `app.getPath("userData")` 也跟着变，新目录是空的，等于要重新扫码。
 *
 * 实测过：这个库里 Electron 用 `session.cookies.set()` 写进去的值
 * **是明文存在 value 列**（不是 encrypted_value），所以不需要 macOS Keychain
 * 的对应密钥，直接搬文件就能用 —— 这也是这里敢直接拷贝而不是走 API 注入的原因。
 *
 * 时机很重要：必须在 **session 打开 Cookies 之前** 完成拷贝，
 * 否则 Chromium 已经持有文件句柄，覆盖会写坏数据库。
 * 所以自动导入放在 main.ts 的模块顶层（app ready 之前），
 * 手动触发的那次走「先备份、再拷贝、然后重启应用」的路径。
 */

/** 旧版的数据目录名（正式版与开发版各一个） */
const LEGACY_DIR_NAMES = ["Biu", "biu-dev"];

/** 判断一个 Cookies 库里有没有登录态。明文存储，直接按字符串找即可 */
const cookieDbHasLogin = (file: string) => {
  try {
    return fs.readFileSync(file).includes("SESSDATA");
  } catch {
    return false;
  }
};

const currentUserDataPath = () => app.getPath("userData");

const legacyUserDataPaths = () => {
  const appData = app.getPath("appData");
  return LEGACY_DIR_NAMES.map(name => path.join(appData, name)).filter(
    dir => path.resolve(dir) !== path.resolve(currentUserDataPath()),
  );
};

const exists = (p: string) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

const copyFileSafe = (from: string, to: string) => {
  try {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    return true;
  } catch (error) {
    log.warn(`[legacy-import] 复制失败 ${from} → ${to}:`, error);
    return false;
  }
};

/** 目录是否为空（不存在也算空） */
const dirIsEmpty = (dir: string) => {
  try {
    return fs.readdirSync(dir).length === 0;
  } catch {
    return true;
  }
};

export interface LegacyImportResult {
  /** 找到的旧版数据目录 */
  source: string | null;
  /** 是否导入了 B 站登录态 */
  loginImported: boolean;
  /** 一并带过来的东西 */
  imported: string[];
  /** 需要用户重启才生效 */
  needRestart: boolean;
}

/**
 * 执行导入。
 *
 * @param options.includeState 是否连 localStorage / 设置一起带过来（首次运行该带，手动同步登录态时不该带，
 *                             否则会把用户在新版里攒的歌单和设置回退掉）
 */
export function importLegacyData(options: { includeState: boolean } = { includeState: false }): LegacyImportResult {
  const result: LegacyImportResult = { source: null, loginImported: false, imported: [], needRestart: false };

  const current = currentUserDataPath();
  const legacy = legacyUserDataPaths().find(dir => exists(dir)) ?? null;
  result.source = legacy;
  if (!legacy) return result;

  // ---- 1) 登录凭据：只在「新版没有、旧版有」时搬 ----
  const legacyCookies = path.join(legacy, "Cookies");
  const currentCookies = path.join(current, "Cookies");

  if (exists(legacyCookies) && cookieDbHasLogin(legacyCookies) && !cookieDbHasLogin(currentCookies)) {
    // 先把现有库备份下来，写坏了还能回退
    if (exists(currentCookies)) copyFileSafe(currentCookies, `${currentCookies}.nwbp-backup`);

    if (copyFileSafe(legacyCookies, currentCookies)) {
      result.loginImported = true;
      result.imported.push("Cookies（B 站登录态）");
      result.needRestart = true;
    }
  }

  // ---- 2) 渲染端 localStorage：refresh_token 与各种 zustand 持久化状态 ----
  if (options.includeState) {
    const legacyLocalStorage = path.join(legacy, "Local Storage");
    const currentLocalStorage = path.join(current, "Local Storage");
    if (exists(legacyLocalStorage) && dirIsEmpty(currentLocalStorage)) {
      try {
        fs.mkdirSync(path.dirname(currentLocalStorage), { recursive: true });
        fs.cpSync(legacyLocalStorage, currentLocalStorage, { recursive: true });
        result.imported.push("Local Storage");
      } catch (error) {
        log.warn("[legacy-import] Local Storage 复制失败:", error);
      }
    }
  }

  // ---- 3) electron-store 的几个 json：只在目标不存在时搬 ----
  const stores = ["user-login-info.json", "app-settings.json", "shortcut-settings.json"];
  for (const name of stores) {
    const from = path.join(legacy, name);
    const to = path.join(current, name);
    if (!exists(from) || exists(to)) continue;
    if (copyFileSafe(from, to)) result.imported.push(name);
  }

  if (result.imported.length) log.info(`[legacy-import] 已从 ${legacy} 导入: ${result.imported.join(", ")}`);

  return result;
}

/** 当前是否已经登录 B 站（用于设置页显示状态、以及决定要不要提示同步） */
export const hasLocalBilibiliLogin = () => cookieDbHasLogin(path.join(currentUserDataPath(), "Cookies"));

/** 是否存在可供导入的旧版数据 */
export const hasLegacyData = () =>
  legacyUserDataPaths().some(
    dir => exists(path.join(dir, "Cookies")) || exists(path.join(dir, "user-login-info.json")),
  );

/**
 * 启动时那次导入的结果。
 * app.ts 的 IPC 处理器要读它来告诉渲染端「这次启动同步了什么」，
 * 所以在模块级留一份，由 main.ts 在 app ready 之前调用 runStartupImport() 写入。
 */
let legacyImportResult: LegacyImportResult = {
  source: null,
  loginImported: false,
  imported: [],
  needRestart: false,
};

export const getLegacyImportResult = () => legacyImportResult;

export const runStartupImport = () => {
  legacyImportResult = importLegacyData({ includeState: true });
  return legacyImportResult;
};
