import { BrowserWindow, dialog, ipcMain, Menu } from "electron";
import log from "electron-log";
import fs from "node:fs/promises";
import path from "node:path";

import { defaultAppSettings } from "@shared/settings/app-settings";

import { createMiniPlayer, destroyMiniPlayer, miniPlayer } from "../mini-player";
import { appSettingsStore } from "../store";
import {
  createDesktopLyricsWindow,
  destroyDesktopLyricsWindow,
  getDesktopLyricsWindow,
  isDesktopLyricsWindowOpen,
  resetDesktopLyricsBounds,
  setDesktopLyricsInteractive,
  syncDesktopLyricsClickThrough,
} from "../windows/desktop-lyrics";
import { channel } from "./channel";

/** 背景图允许的最大体积，超过就不读了（避免把几十 MB 塞进渲染进程） */
const MAX_BACKGROUND_IMAGE_BYTES = 32 * 1024 * 1024;

/** 桌面歌词字号范围与步长，和设置页滑杆保持一致 */
const DESKTOP_LYRICS_FONT_SIZE_MIN = 16;
const DESKTOP_LYRICS_FONT_SIZE_MAX = 72;
const DESKTOP_LYRICS_FONT_SIZE_STEP = 4;
const DESKTOP_LYRICS_FONT_SIZE_PRESETS = [24, 34, 44, 56];

/** 右键菜单里的文字颜色快捷档 */
const DESKTOP_LYRICS_COLOR_PRESETS = [
  { label: "白色", value: "#ffffff" },
  { label: "浅黄", value: "#ffe08a" },
  { label: "浅粉", value: "#ffb3c1" },
  { label: "薄荷绿", value: "#9ff5c8" },
  { label: "黑色", value: "#111111" },
];

/** 底板透明度快捷档 */
const DESKTOP_LYRICS_OPACITY_PRESETS = [0, 30, 55, 80, 100];
/** 文字透明度快捷档 */
const DESKTOP_LYRICS_TEXT_OPACITY_PRESETS = [100, 85, 70, 55, 35];

/** 右键菜单里的底板纯色快捷档 */
const DESKTOP_LYRICS_BACKGROUND_COLORS = [
  { label: "深灰", value: "#0e0e12" },
  { label: "纯黑", value: "#000000" },
  { label: "深蓝", value: "#0b1a2b" },
  { label: "墨绿", value: "#0b1f18" },
  { label: "暖褐", value: "#241a12" },
  { label: "浅白", value: "#f5f5f7" },
];

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
};

/**
 * 开场视频的最大体积。
 * 开场动画是「每次启动都要读一遍」的东西，上限压得比背景图低一些 ——
 * 超了就让设置页提示换个小点的文件，别让启动被一个 200MB 的视频拖住。
 */
const MAX_LAUNCH_VIDEO_BYTES = 64 * 1024 * 1024;

const VIDEO_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

/**
 * 把本地图片读成 data URL。
 * 用 data URL 而不是 file:// ：渲染进程是 file:// 页面，
 * 走 data URL 可以绕开各平台对本地文件子资源加载的差异。
 */
async function readImageAsDataUrl(filePath: string): Promise<string | null> {
  try {
    if (!filePath) return null;

    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > MAX_BACKGROUND_IMAGE_BYTES) return null;

    const ext = path.extname(filePath).toLowerCase();
    const mime = IMAGE_MIME[ext];
    if (!mime) return null;

    const buf = await fs.readFile(filePath);
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export function registerWindowHandlers({ getMainWindow }) {
  ipcMain.on(channel.window.minimize, event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });

  ipcMain.on(channel.window.toggleMaximize, event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.on(channel.window.close, event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  ipcMain.handle(channel.window.isMaximized, event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });

  ipcMain.handle(channel.window.isFullScreen, event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isFullScreen() ?? false;
  });

  ipcMain.handle(channel.window.toggleMini, () => {
    const mainWindow = getMainWindow?.();
    if (miniPlayer && !miniPlayer.isDestroyed()) {
      destroyMiniPlayer();
      mainWindow?.show();
    } else {
      mainWindow?.hide();
      createMiniPlayer();
    }
  });

  ipcMain.on(channel.window.toggleDevTools, event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.webContents.toggleDevTools();
  });

  /**
   * 窗口"透明背景"开关。
   * 窗口本身在创建时就是 transparent 的（见 main.ts），所以这里只需要
   * 控制 macOS 的系统毛玻璃；其余平台的透明由渲染端的 CSS 负责。
   */
  ipcMain.on(channel.window.setTransparent, (event, enabled: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;

    if (process.platform === "darwin") {
      win.setVibrancy(enabled ? "under-window" : null);
    }
  });

  /** 选择一张本地图片作为背景，返回路径与 data URL */
  ipcMain.handle(channel.window.pickBackgroundImage, async () => {
    const result = await dialog.showOpenDialog({
      title: "选择背景图片",
      properties: ["openFile"],
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"] }],
    });

    const filePath = result.canceled ? null : (result.filePaths?.[0] ?? null);
    if (!filePath) return null;

    return { path: filePath, dataUrl: await readImageAsDataUrl(filePath) };
  });

  /** 启动时把已保存的背景图读回来 */
  ipcMain.handle(channel.window.readBackgroundImage, (_event, filePath: string) => readImageAsDataUrl(filePath));

  // ------------------------------------------------------- app 打开动画的视频

  /** 选一个本地视频当开场动画。只回路径与体积，视频本体等真要播时再读 */
  ipcMain.handle(channel.window.pickLaunchVideo, async () => {
    const result = await dialog.showOpenDialog({
      title: "选择开场视频",
      properties: ["openFile"],
      filters: [{ name: "视频", extensions: ["mp4", "webm", "mov", "m4v"] }],
    });

    const filePath = result.canceled ? null : (result.filePaths?.[0] ?? null);
    if (!filePath) return null;

    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) return null;
      return { path: filePath, size: stat.size, tooLarge: stat.size > MAX_LAUNCH_VIDEO_BYTES };
    } catch {
      return null;
    }
  });

  /**
   * 把开场视频读成字节交给渲染端做 Blob URL。
   *
   * 刻意**不**走 data URL：视频动辄几十 MB，base64 还要再胖三分之一，
   * 而 Blob URL 是零拷贝引用，`<video>` 也能正常 seek。
   */
  ipcMain.handle(channel.window.readLaunchVideo, async (_event, filePath: string) => {
    try {
      if (!filePath) return null;

      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size > MAX_LAUNCH_VIDEO_BYTES) return null;

      const mime = VIDEO_MIME[path.extname(filePath).toLowerCase()];
      if (!mime) return null;

      return { mime, data: await fs.readFile(filePath) };
    } catch {
      return null;
    }
  });

  // ---------------------------------------------------------------- 桌面歌词

  const patchSettings = (patch: Partial<AppSettings>) => {
    try {
      const settings = appSettingsStore.get("appSettings");
      appSettingsStore.set("appSettings", { ...settings, ...patch });
    } catch (error) {
      log.warn("[desktop-lyrics] 写入设置失败:", error);
    }
  };

  /**
   * 把「桌面歌词的当前状态」推给两个窗口。
   *
   * 为什么必须由主进程广播：主窗口与桌面歌词窗是两个渲染进程，
   * 各自的 zustand store 是独立的内存副本，谁也看不到谁改了什么。
   * 而开关和锁定这两件事**只有主进程是准的** —— 比如用户直接在歌词条上点 ×，
   * 那是主进程 destroy 的窗口，两个渲染端都不知道。
   */
  const broadcastDesktopLyricsState = () => {
    let settings: AppSettings | undefined;
    try {
      settings = appSettingsStore.get("appSettings");
    } catch (error) {
      log.warn("[desktop-lyrics] 读取设置失败:", error);
    }

    const payload: DesktopLyricsStyle = {
      fontSize: settings?.desktopLyricsFontSize ?? 34,
      color: settings?.desktopLyricsColor ?? "#ffffff",
      backgroundMode: settings?.desktopLyricsBackgroundMode ?? "transparent",
      backgroundOpacity: settings?.desktopLyricsBackgroundOpacity ?? 0,
      backgroundColor: settings?.desktopLyricsBackgroundColor ?? "#0e0e12",
      backgroundImage: settings?.desktopLyricsBackgroundImage ?? "",
      backgroundImageBlur: settings?.desktopLyricsBackgroundImageBlur ?? 8,
      textOpacity: settings?.desktopLyricsTextOpacity ?? 100,
      showTranslation: settings?.desktopLyricsShowTranslation ?? true,
      showRomanization: settings?.desktopLyricsShowRomanization ?? false,
      spectrum: settings?.desktopLyricsSpectrum ?? true,
      enabled: Boolean(settings?.desktopLyrics),
      locked: Boolean(settings?.desktopLyricsLocked),
    };

    for (const win of [getDesktopLyricsWindow(), getMainWindow()]) {
      if (win && !win.isDestroyed()) win.webContents.send(channel.desktopLyrics.styleChanged, payload);
    }
  };

  ipcMain.handle(channel.desktopLyrics.setEnabled, (_event, enabled: boolean) => {
    patchSettings({ desktopLyrics: enabled });
    if (enabled) createDesktopLyricsWindow();
    else destroyDesktopLyricsWindow();
    // 开窗是异步的（did-finish-load 之后才收得到），但状态广播可以先发；
    // 窗口自己在挂载时也会主动拉一次，两条路都能拿到
    broadcastDesktopLyricsState();
    return enabled;
  });

  ipcMain.handle(channel.desktopLyrics.isOpen, () => isDesktopLyricsWindowOpen());

  ipcMain.handle(channel.desktopLyrics.close, () => {
    // 关窗要连设置一起关掉，否则下次启动 restoreDesktopLyricsOnStartup() 又把它弹回来
    patchSettings({ desktopLyrics: false });
    destroyDesktopLyricsWindow();
    broadcastDesktopLyricsState();
  });

  ipcMain.handle(channel.desktopLyrics.setInteractive, (_event, interactive: boolean) => {
    setDesktopLyricsInteractive(interactive);
  });

  ipcMain.handle(channel.desktopLyrics.setLocked, (_event, locked: boolean) => {
    patchSettings({ desktopLyricsLocked: locked });
    syncDesktopLyricsClickThrough();
    broadcastDesktopLyricsState();
    return locked;
  });

  /**
   * 样式变更推给桌面歌词窗。
   * 设置页改字号/颜色时调它，桌面歌词窗不用自己去轮询设置。
   * 注意这里**只写样式四项**，开关和锁定各有各的 handler，避免互相覆盖。
   */
  ipcMain.handle(channel.desktopLyrics.styleChanged, (_event, style: DesktopLyricsStyle) => {
    patchSettings({
      desktopLyricsFontSize: style.fontSize,
      desktopLyricsColor: style.color,
      desktopLyricsBackgroundMode: style.backgroundMode,
      desktopLyricsBackgroundOpacity: style.backgroundOpacity,
      desktopLyricsBackgroundColor: style.backgroundColor,
      desktopLyricsBackgroundImage: style.backgroundImage,
      desktopLyricsBackgroundImageBlur: style.backgroundImageBlur,
      desktopLyricsTextOpacity: style.textOpacity,
      desktopLyricsShowTranslation: style.showTranslation,
      desktopLyricsShowRomanization: style.showRomanization,
      // 老渲染端可能不带这个字段，别顺手把设置写成 undefined
      ...(typeof style.spectrum === "boolean" ? { desktopLyricsSpectrum: style.spectrum } : {}),
    });

    broadcastDesktopLyricsState();
  });

  // ------------------------------------------------- 桌面歌词：右键菜单 / 字号

  const readSettings = (): AppSettings | undefined => {
    try {
      return appSettingsStore.get("appSettings");
    } catch (error) {
      log.warn("[desktop-lyrics] 读取设置失败:", error);
      return undefined;
    }
  };

  const clampFontSize = (value: number) =>
    Math.min(DESKTOP_LYRICS_FONT_SIZE_MAX, Math.max(DESKTOP_LYRICS_FONT_SIZE_MIN, Math.round(value)));

  const setFontSize = (value: number) => {
    patchSettings({ desktopLyricsFontSize: clampFontSize(value) });
    broadcastDesktopLyricsState();
  };

  ipcMain.handle(channel.desktopLyrics.adjustFontSize, (_event, delta: number) => {
    const current = readSettings()?.desktopLyricsFontSize ?? defaultAppSettings.desktopLyricsFontSize;
    const step = (delta || 0) >= 0 ? DESKTOP_LYRICS_FONT_SIZE_STEP : -DESKTOP_LYRICS_FONT_SIZE_STEP;
    const next = clampFontSize(current + step);
    setFontSize(next);
    return next;
  });

  ipcMain.handle(channel.desktopLyrics.resetBounds, () => {
    resetDesktopLyricsBounds();
  });

  /**
   * 系统右键菜单。
   *
   * 为什么不自绘 DOM 菜单：歌词窗只有 160px 高，菜单一展开就会被窗口边界裁掉 ——
   * 除非把窗口临时撑大，那样更别扭。原生菜单不受窗口尺寸限制。
   *
   * 菜单项直接改设置 + 广播，渲染端不需要额外处理。
   */
  ipcMain.handle(channel.desktopLyrics.showMenu, () => {
    const win = getDesktopLyricsWindow();
    if (!win || win.isDestroyed()) return;

    const settings = readSettings() ?? defaultAppSettings;
    const fontSize = settings.desktopLyricsFontSize ?? defaultAppSettings.desktopLyricsFontSize;
    const locked = Boolean(settings.desktopLyricsLocked);
    const backgroundMode: DesktopLyricsBackgroundMode = settings.desktopLyricsBackgroundMode ?? "transparent";
    const backgroundOpacity = settings.desktopLyricsBackgroundOpacity ?? 0;
    const backgroundColor = settings.desktopLyricsBackgroundColor ?? "#0e0e12";
    const textOpacity = settings.desktopLyricsTextOpacity ?? 100;

    const togglePatch = (patch: Partial<AppSettings>) => {
      patchSettings(patch);
      broadcastDesktopLyricsState();
    };

    /**
     * 切底板模式。
     * 从「透明」切到纯色/背景图时，如果当前不透明度是 0，
     * 顺手提到 85 —— 否则用户切过去了却什么都看不见，会以为坏了。
     */
    const setBackgroundMode = (mode: DesktopLyricsBackgroundMode) => {
      const patch: Partial<AppSettings> = { desktopLyricsBackgroundMode: mode };
      if (mode !== "transparent" && backgroundOpacity === 0) patch.desktopLyricsBackgroundOpacity = 85;
      togglePatch(patch);
    };

    /** 从菜单里直接选背景图：复用主窗口那套选图对话框 */
    const pickBackgroundImageForLyrics = async () => {
      const result = await dialog.showOpenDialog({
        title: "选择桌面歌词底板图片",
        properties: ["openFile"],
        filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"] }],
      });

      const filePath = result.canceled ? null : (result.filePaths?.[0] ?? null);
      if (!filePath) return;

      togglePatch({
        desktopLyricsBackgroundMode: "image",
        desktopLyricsBackgroundImage: filePath,
        ...(backgroundOpacity === 0 ? { desktopLyricsBackgroundOpacity: 85 } : {}),
      });
    };

    const menu = Menu.buildFromTemplate([
      {
        label: "锁定（鼠标穿透）",
        type: "checkbox",
        checked: locked,
        click: () => {
          patchSettings({ desktopLyricsLocked: !locked });
          syncDesktopLyricsClickThrough();
          broadcastDesktopLyricsState();
        },
      },
      { type: "separator" },
      {
        label: `歌词字号（当前 ${fontSize}px）`,
        submenu: [
          {
            label: `增大  +${DESKTOP_LYRICS_FONT_SIZE_STEP}px`,
            enabled: fontSize < DESKTOP_LYRICS_FONT_SIZE_MAX,
            click: () => setFontSize(fontSize + DESKTOP_LYRICS_FONT_SIZE_STEP),
          },
          {
            label: `减小  −${DESKTOP_LYRICS_FONT_SIZE_STEP}px`,
            enabled: fontSize > DESKTOP_LYRICS_FONT_SIZE_MIN,
            click: () => setFontSize(fontSize - DESKTOP_LYRICS_FONT_SIZE_STEP),
          },
          { type: "separator" },
          ...DESKTOP_LYRICS_FONT_SIZE_PRESETS.map(preset => ({
            label: `${preset}px`,
            type: "radio" as const,
            checked: fontSize === preset,
            click: () => setFontSize(preset),
          })),
          { type: "separator" },
          { label: "也可用 Ctrl / ⌘ + 滚轮", enabled: false },
        ],
      },
      {
        label: "文字颜色",
        submenu: DESKTOP_LYRICS_COLOR_PRESETS.map(preset => ({
          label: preset.label,
          type: "radio" as const,
          checked: settings.desktopLyricsColor === preset.value,
          click: () => togglePatch({ desktopLyricsColor: preset.value }),
        })),
      },
      { type: "separator" },
      {
        // 底板三选一：透明 / 纯色 / 自定义背景图，下面是这个模式自己的参数
        label: "歌词底板",
        submenu: [
          {
            label: "透明（只有字）",
            type: "radio" as const,
            checked: backgroundMode === "transparent",
            click: () => setBackgroundMode("transparent"),
          },
          {
            label: "纯色",
            type: "radio" as const,
            checked: backgroundMode === "color",
            click: () => setBackgroundMode("color"),
          },
          {
            label: "自定义背景图",
            type: "radio" as const,
            checked: backgroundMode === "image",
            click: () => setBackgroundMode("image"),
          },
          { type: "separator" },
          { label: "更换背景图…", click: () => void pickBackgroundImageForLyrics() },
          { type: "separator" },
          {
            label: "底板色",
            submenu: DESKTOP_LYRICS_BACKGROUND_COLORS.map(preset => ({
              label: preset.label,
              type: "radio" as const,
              checked: backgroundColor === preset.value,
              // 选颜色时顺带切到纯色模式，省一步
              click: () =>
                togglePatch({ desktopLyricsBackgroundColor: preset.value, desktopLyricsBackgroundMode: "color" }),
            })),
          },
          {
            label: `不透明度（当前 ${backgroundOpacity}%）`,
            submenu: [
              {
                type: "radio" as const,
                label: "0%",
                checked: backgroundOpacity === 0,
                click: () => togglePatch({ desktopLyricsBackgroundOpacity: 0 }),
              },
              ...DESKTOP_LYRICS_OPACITY_PRESETS.filter(v => v > 0).map(value => ({
                label: `${value}%`,
                type: "radio" as const,
                checked: backgroundOpacity === value,
                click: () => togglePatch({ desktopLyricsBackgroundOpacity: value }),
              })),
            ],
          },
        ],
      },
      {
        label: `歌词文字（当前 ${textOpacity}%）`,
        submenu: DESKTOP_LYRICS_TEXT_OPACITY_PRESETS.map(value => ({
          label: `${value}%`,
          type: "radio" as const,
          checked: textOpacity === value,
          click: () => togglePatch({ desktopLyricsTextOpacity: value }),
        })),
      },
      { type: "separator" },
      {
        label: "显示翻译",
        type: "checkbox",
        checked: Boolean(settings.desktopLyricsShowTranslation),
        click: () => togglePatch({ desktopLyricsShowTranslation: !settings.desktopLyricsShowTranslation }),
      },
      {
        label: "显示罗马音",
        type: "checkbox",
        checked: Boolean(settings.desktopLyricsShowRomanization),
        click: () => togglePatch({ desktopLyricsShowRomanization: !settings.desktopLyricsShowRomanization }),
      },
      {
        label: "显示频谱条",
        type: "checkbox",
        checked: settings.desktopLyricsSpectrum !== false,
        click: () => togglePatch({ desktopLyricsSpectrum: settings.desktopLyricsSpectrum === false }),
      },
      { type: "separator" },
      { label: "重置窗口位置", click: () => resetDesktopLyricsBounds() },
      {
        label: "关闭桌面歌词",
        click: () => {
          patchSettings({ desktopLyrics: false });
          destroyDesktopLyricsWindow();
          broadcastDesktopLyricsState();
        },
      },
    ]);

    menu.popup({ window: win });
  });
}
