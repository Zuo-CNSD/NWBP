import { app, BrowserWindow } from "electron";
import isDev from "electron-is-dev";
import log from "electron-log";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyProxySettings } from "./ipc/app";
import { channel } from "./ipc/channel";
import { quitAndSaveTasks } from "./ipc/download";
import { registerIpcHandlers } from "./ipc/index";
import { runStartupImport } from "./legacy-import";
import { destroyMiniPlayer } from "./mini-player";
import { injectAuthCookie } from "./network/cookie";
import { installWebRequestInterceptors } from "./network/interceptor";
import { registerAllShortcuts, unregisterAllShortcuts } from "./shortcut";
import { appSettingsStore } from "./store";
import { getWindowIcon } from "./utils";
import { restoreDesktopLyricsOnStartup } from "./windows/desktop-lyrics";
import { setupWindowsThumbar } from "./windows/thumbar";
import { createTray, destroyTray } from "./windows/tray"; // 托盘功能

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

log.initialize();

if (isDev) {
  // 为 chrome-devtools-mcp 开启远程调试端口
  app.commandLine.appendSwitch("remote-debugging-port", "");
  // 开发环境数据隔离
  app.setPath("userData", path.join(app.getPath("appData"), `nwbp-dev`));
}

/*
 * 从旧版 Biu 同步数据。
 *
 * 必须放在模块顶层、`app.whenReady()` 之前 —— Chromium 一旦打开过
 * `Cookies` 这个 SQLite 库就会一直持有句柄，之后再覆盖文件会写坏数据库，
 * 所以「搬登录态」这件事只有这个时间窗能做。
 *
 * includeState: 首次运行连 localStorage / 设置一起带过来；
 * 之后每次启动只补「新版缺、旧版有」的那几样，不会反复覆盖用户的新数据。
 */
runStartupImport();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: isDev ? "NWBP-dev" : "NWBP",
    icon: getWindowIcon(),
    show: true,
    hasShadow: true,
    width: 1200,
    height: 800,
    minWidth: 1200,
    minHeight: 800,
    resizable: true,
    // 跟随 web 页面大小
    useContentSize: true,
    // 窗口居中
    center: true,
    // 无边框
    frame: false,
    /*
     * 窗口始终建成"可透明"的：圆角由渲染端的 CSS 画（见 app.css 的 .app-shell）。
     * 这样「透明背景」开关切换时不需要重建窗口，只切 CSS + macOS 的系统毛玻璃即可。
     */
    transparent: true,
    backgroundColor: "#00000000",
    titleBarStyle: "hidden",
    titleBarOverlay: false,
    visualEffectState: "active",
    trafficLightPosition: { x: 8, y: 8 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      webSecurity: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
      /*
       * 关掉后台节流。
       *
       * 桌面歌词窗自己**没有音频**，频谱柱高只能由主窗口算好再广播过去
       * （见 src/common/utils/desktop-lyrics-channel.ts）。
       * 而 Chromium 默认会在窗口不可见时冻结后台渲染进程的定时器与动画帧 ——
       * 于是「主窗口被全屏盖住」或「缩到 Dock」时，频谱就整个停住不动了，
       * 用户从桌面上看就是「条冻住了、歌词正常」（歌词走的是播放进度事件，不受影响）。
       *
       * 主窗口需要长期在后台保持这条采集循环，所以这里必须关掉节流。
       */
      backgroundThrottling: false,
    },
  });

  // 禁止通过中键/target=_blank/window.open 等方式在 Electron 中打开新窗口
  // 不影响当前窗口内的左键导航与其他鼠标按键行为
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  // 禁止 Ctrl+R / Cmd+R 刷新页面
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === "r") {
      event.preventDefault();
    }
  });

  const indexPath = path.resolve(__dirname, "../dist/web/index.html");
  mainWindow.loadFile(indexPath);

  // 初始化 Windows 任务栏缩略按钮，并监听播放状态更新
  if (process.platform === "win32") {
    setupWindowsThumbar(mainWindow);

    // 拦截 WM_INITMENU (0x0116) 消息，阻止系统菜单
    mainWindow.hookWindowMessage(0x0116, () => {
      mainWindow?.setEnabled(false);
      setTimeout(() => {
        mainWindow?.setEnabled(true);
      }, 100);
      return true;
    });
  }

  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send(channel.window.maximize);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send(channel.window.unmaximize);
  });

  mainWindow.on("enter-full-screen", () => {
    mainWindow?.webContents.send(channel.window.enterFullScreen);
  });

  mainWindow.on("leave-full-screen", () => {
    mainWindow?.webContents.send(channel.window.leaveFullScreen);
  });

  // 从store获取配置，判断是否关闭窗口时隐藏还是退出程序
  mainWindow.on("close", event => {
    const closeWindowOption = appSettingsStore.get("appSettings").closeWindowOption;

    if ((app as any).quitting) {
      return;
    }

    if (closeWindowOption === "hide") {
      event.preventDefault();
      mainWindow?.hide();
    } else if (closeWindowOption === "exit") {
      if ((app as any).quitting) {
        mainWindow = null;
      }
    }
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    let startupSettings: AppSettings | undefined;
    try {
      startupSettings = appSettingsStore.get("appSettings");
      applyProxySettings(startupSettings?.proxySettings).catch(error => {
        log.error("[main] Failed to apply proxy settings on startup:", error);
      });
    } catch (error) {
      log.error("[main] Failed to read proxy settings from store:", error);
    }

    createWindow();
    // 桌面歌词：设置里开着就在启动时把窗建回来
    restoreDesktopLyricsOnStartup();

    // 恢复「透明背景」设置：macOS 上用系统毛玻璃，其余平台由渲染端 CSS 负责
    if (startupSettings?.windowTransparent && process.platform === "darwin" && mainWindow) {
      mainWindow.setVibrancy("under-window");
    }

    injectAuthCookie();

    installWebRequestInterceptors();

    registerIpcHandlers({
      getMainWindow: () => mainWindow,
    });

    registerAllShortcuts(() => mainWindow);

    /*
     * 托盘在**三个平台都建**。
     * 以前 macOS 上不建，但设置页默认就是「窗口关闭 → 隐藏到托盘」，
     * 结果 macOS 用户关掉窗口后没有任何「程序还在跑」的可见凭据（音乐还在放），
     * 看起来就像程序已经退出了。macOS 上它以菜单栏图标的形式出现。
     */
    createTray({
      getMainWindow: () => mainWindow,
      onExit: () => {
        (app as any).quitting = true;
        app.quit();
      },
    });
  });

  /*
   * 点 Dock 图标 / 从菜单栏唤回。
   * 最小化过的窗口要先 restore()，否则 show() 之后人还停在 Dock 缩略图里；
   * 再 focus() 一下 —— 不然窗口是回来了却压在别的窗口下面，用户会以为还没恢复。
   */
  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.on("before-quit", () => {
    (app as any).quitting = true;
  });

  app.on("will-quit", () => {
    try {
      quitAndSaveTasks();
    } catch (err) {
      log.error("[main] quitAndSaveTasks failed:", err);
    }

    try {
      destroyTray();
    } catch (err) {
      log.warn("[main] destroyTray failed:", err);
    }

    destroyMiniPlayer();

    unregisterAllShortcuts();

    if (isDev) {
      process.exit(0);
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }

      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }

      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

// 全局异常处理，避免未捕获异常导致进程异常驻留
process.on("uncaughtException", err => {
  log.error("[uncaughtException]", err);
  (app as any).quitting = true;
  app.quit();
});

process.on("unhandledRejection", reason => {
  log.error("[unhandledRejection]", reason);
});
