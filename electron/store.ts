import { app } from "electron";
import Store from "electron-store";

import { defaultAppSettings } from "@shared/settings/app-settings";
import { defaultShortcutSettings } from "@shared/settings/shortcut-settings";
import { StoreNameMap } from "@shared/store";

import type { FullMediaDownloadTask } from "./ipc/download/types";

import { getUserDataPath } from "./utils";

export const appSettingsStore = new Store<{ appSettings: AppSettings }>({
  name: StoreNameMap.AppSettings,
  cwd: getUserDataPath(),
  defaults: {
    appSettings: {
      ...defaultAppSettings,
      downloadPath: app.getPath("downloads"),
    },
  },
});

/*
 * 一次性迁移：桌面歌词的「锁定」默认值从 true 改成 false。
 *
 * 为什么必须迁移而不是只改默认值：electron-store 会把 defaults 和已存的值合并，
 * 老用户存的就是 true，光改默认值他们仍然处于「整窗鼠标穿透」状态 ——
 * 那种状态下歌词拖不动、右键菜单也点不出来，等于功能全废。
 *
 * 用 marker 保证只迁一次：否则用户手动上锁之后，每次重启都会被改回不锁。
 */
try {
  const current = appSettingsStore.get("appSettings");
  if (current && current.desktopLyricsLockMigrated !== true) {
    appSettingsStore.set("appSettings", {
      ...current,
      desktopLyricsLocked: false,
      desktopLyricsLockMigrated: true,
    });
  }
} catch {
  /* 迁移失败不该拦住启动，后面的默认值兜底 */
}

export const userStore = new Store<UserInfo>({
  name: StoreNameMap.UserLoginInfo,
  cwd: getUserDataPath(),
  encryptionKey: StoreNameMap.UserLoginInfo,
});

export const mediaDownloadsStore = new Store<Record<string, FullMediaDownloadTask>>({
  name: StoreNameMap.MediaDownloads,
  cwd: getUserDataPath(),
});

export const shortcutKeyStore = new Store<ShortcutSettings>({
  name: StoreNameMap.ShortcutSettings,
  cwd: getUserDataPath(),
  defaults: {
    ...defaultShortcutSettings,
  },
});

export const lyricsCacheStore = new Store<Record<string, MusicLyrics>>({
  name: StoreNameMap.LyricsCache,
  cwd: getUserDataPath(),
  defaults: {},
});

/**
 * 网易云登录态。加密落盘（cookie 等同于账号凭据）。
 */
export const neteaseAccountStore = new Store<NeteaseAccountState>({
  name: StoreNameMap.NeteaseAccount,
  cwd: getUserDataPath(),
  encryptionKey: StoreNameMap.NeteaseAccount,
  defaults: {
    cookie: "",
    uid: null,
    nickname: "",
    avatarUrl: "",
  },
});

/**
 * 歌词「这首歌选了哪个源的哪一条」的人工决定，按曲目 id 存。
 * 存下来才能在下次播放时跳过自动匹配、直接用用户手选的版本。
 */
export const lyricsMatchStore = new Store<Record<string, LyricsMatchRecord>>({
  name: StoreNameMap.LyricsMatch,
  cwd: getUserDataPath(),
  defaults: {},
});
