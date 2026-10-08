import { BrowserWindow, screen } from "electron";
import isDev from "electron-is-dev";
import log from "electron-log";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { appSettingsStore } from "../store";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 桌面歌词窗。
 *
 * 和迷你播放器同源（同一个 index.html 的不同 hash 路由），但有几处关键差别：
 *  - `focusable: false`：点歌词不该把主窗口的焦点抢走，
 *    否则用户正在输入框里打字会被打断；
 *  - `setAlwaysOnTop(true, "screen-saver")`：默认层级盖不住全屏应用，
 *    抬到 screen-saver 这一层才能在别人全屏看视频时也浮在上面；
 *  - macOS 上要 `setVisibleOnAllWorkspaces`，切桌面时它才会跟着走；
 *  - 锁定后 `setIgnoreMouseEvents(true, { forward: true })`：鼠标事件穿透到下层，
 *    但窗口自己还能收到移动事件（forward 的作用），方便之后解锁。
 */

const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 160;
/** 距离屏幕下边缘的默认留白 */
const DEFAULT_BOTTOM_GAP = 72;

let desktopLyricsWindow: BrowserWindow | null = null;
/** 拖动/缩放结束时才写盘，避免拖的过程里疯狂写设置 */
let saveBoundsTimer: NodeJS.Timeout | null = null;

const readBounds = () => {
  try {
    return appSettingsStore.get("appSettings")?.desktopLyricsBounds ?? null;
  } catch {
    return null;
  }
};

const persistBounds = (bounds: Electron.Rectangle) => {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => {
    saveBoundsTimer = null;
    try {
      const settings = appSettingsStore.get("appSettings");
      appSettingsStore.set("appSettings", { ...settings, desktopLyricsBounds: bounds });
    } catch (error) {
      log.warn("[desktop-lyrics] 保存窗口位置失败:", error);
    }
  }, 400);
};

/** 没拖过就贴着屏幕下方居中；拖过就还原上次的位置 */
const resolveInitialBounds = () => {
  const saved = readBounds();
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    return {
      x: Math.round(saved.x),
      y: Math.round(saved.y),
      width: Math.max(320, Math.round(saved.width || DEFAULT_WIDTH)),
      height: Math.max(96, Math.round(saved.height || DEFAULT_HEIGHT)),
    };
  }

  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(DEFAULT_WIDTH, Math.max(320, workArea.width - 80));
  const height = DEFAULT_HEIGHT;

  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + workArea.height - height - DEFAULT_BOTTOM_GAP),
    width,
    height,
  };
};

const applyClickThrough = () => {
  if (!desktopLyricsWindow) return;
  const locked = Boolean(appSettingsStore.get("appSettings")?.desktopLyricsLocked);
  // forward: true —— 锁定后依然能收到 move 事件，解锁按钮才不会被自己吃掉
  desktopLyricsWindow.setIgnoreMouseEvents(locked, { forward: true });
};

export const createDesktopLyricsWindow = () => {
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    desktopLyricsWindow.show();
    return desktopLyricsWindow;
  }

  desktopLyricsWindow = new BrowserWindow({
    title: "NWBP 桌面歌词",
    ...resolveInitialBounds(),
    show: true,
    frame: false,
    transparent: true,
    hasShadow: false,
    roundedCorners: false,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // 不抢焦点：桌面歌词不该打断用户在主窗口里的操作
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      webSecurity: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
  });

  desktopLyricsWindow.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin") {
    desktopLyricsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  desktopLyricsWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  /*
   * 这里只是挡掉 Electron 的默认行为；DOM 的 contextmenu 事件已经在渲染端触发过了，
   * 歌词窗自己会调 IPC 让主进程弹原生菜单（自绘菜单放不进 160px 高的窗口）。
   */
  desktopLyricsWindow.webContents.on("context-menu", event => event.preventDefault());
  desktopLyricsWindow.webContents.on("before-input-event", (event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === "r") event.preventDefault();
  });

  const handleBoundsChange = () => {
    if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
    persistBounds(desktopLyricsWindow.getBounds());
  };
  desktopLyricsWindow.on("moved", handleBoundsChange);
  desktopLyricsWindow.on("resized", handleBoundsChange);

  desktopLyricsWindow.on("closed", () => {
    desktopLyricsWindow = null;
  });

  const indexPath = path.resolve(__dirname, "../dist/web/index.html");
  void desktopLyricsWindow.loadFile(indexPath, { hash: "desktop-lyrics" });

  desktopLyricsWindow.webContents.once("did-finish-load", () => applyClickThrough());

  return desktopLyricsWindow;
};

export const destroyDesktopLyricsWindow = () => {
  if (saveBoundsTimer) {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = null;
  }
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    desktopLyricsWindow.destroy();
  }
  desktopLyricsWindow = null;
};

export const isDesktopLyricsWindowOpen = () => Boolean(desktopLyricsWindow && !desktopLyricsWindow.isDestroyed());

/**
 * 临时切换「能不能点」。
 * 锁定状态靠悬停临时放开，所以这个不做持久化，只改窗口行为。
 */
export const setDesktopLyricsInteractive = (interactive: boolean) => {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  desktopLyricsWindow.setIgnoreMouseEvents(!interactive, { forward: true });
};

/** 锁定状态变化时同步到窗口 */
export const syncDesktopLyricsClickThrough = () => applyClickThrough();

/**
 * 把窗口位置和尺寸重置回默认（贴着屏幕下方居中），同时清掉记住的值。
 */
export const resetDesktopLyricsBounds = () => {
  try {
    const settings = appSettingsStore.get("appSettings");
    appSettingsStore.set("appSettings", { ...settings, desktopLyricsBounds: null });
  } catch (error) {
    log.warn("[desktop-lyrics] 重置窗口位置失败:", error);
  }

  const win = getDesktopLyricsWindow();
  if (win && !win.isDestroyed()) {
    // 上面已经把 desktopLyricsBounds 清成 null，所以这里拿到的是默认位置
    win.setBounds(resolveInitialBounds());
  }
};

export const getDesktopLyricsWindow = () => desktopLyricsWindow;

/**
 * 启动时按设置恢复。
 * 设置里开着就建窗，关着就什么都不做。
 */
export const restoreDesktopLyricsOnStartup = () => {
  try {
    if (appSettingsStore.get("appSettings")?.desktopLyrics) createDesktopLyricsWindow();
  } catch (error) {
    log.warn("[desktop-lyrics] 启动恢复失败:", error);
  }
};
