import { contextBridge, ipcRenderer } from "electron";

import { channel } from "./ipc/channel";

let playerPrevHandler: ((_: Electron.IpcRendererEvent) => void) | null = null;
let playerNextHandler: ((_: Electron.IpcRendererEvent) => void) | null = null;
let playerToggleHandler: ((_: Electron.IpcRendererEvent) => void) | null = null;

const api: ElectronAPI = {
  getStore: name => ipcRenderer.invoke(channel.store.get, name),
  setStore: (name, value: any) => ipcRenderer.invoke(channel.store.set, name, value),
  clearStore: name => ipcRenderer.invoke(channel.store.clear, name),
  selectDirectory: (title?: string) => ipcRenderer.invoke(channel.dialog.selectDirectory, title),
  selectFile: () => ipcRenderer.invoke(channel.dialog.selectFile),
  openDirectory: path => ipcRenderer.invoke(channel.dialog.openDirectory, path),
  showFileInFolder: filePath => ipcRenderer.invoke(channel.dialog.showFileInFolder, filePath),
  openExternal: url => ipcRenderer.invoke(channel.dialog.openExternal, url),
  getFonts: () => ipcRenderer.invoke(channel.font.getFonts),
  getCookie: key => ipcRenderer.invoke(channel.cookie.get, key),
  setCookie: (name, value, expirationDate) => ipcRenderer.invoke(channel.cookie.set, { name, value, expirationDate }),
  searchNeteaseSongs: params => ipcRenderer.invoke(channel.lyrics.searchNeteaseSongs, params),
  getNeteaseLyrics: params => ipcRenderer.invoke(channel.lyrics.getNeteaseLyrics, params),
  searchLrclibLyrics: params => ipcRenderer.invoke(channel.lyrics.searchLrclib, params),
  // 多源歌词聚合与加工
  resolveLyricsCandidates: params => ipcRenderer.invoke(channel.lyrics.resolveCandidates, params),
  resolveNeteaseLyricsById: (id, target) => ipcRenderer.invoke(channel.lyrics.resolveNeteaseById, id, target),
  translateLyricsLines: (lines, target) => ipcRenderer.invoke(channel.lyrics.translateLines, lines, target),
  romanizeLyricsLines: lines => ipcRenderer.invoke(channel.lyrics.romanizeLines, lines),
  getLyricsMatchPick: trackKey => ipcRenderer.invoke(channel.lyrics.getMatchPick, trackKey),
  setLyricsMatchPick: (trackKey, pick) => ipcRenderer.invoke(channel.lyrics.setMatchPick, trackKey, pick),
  clearLyricsMatchPick: trackKey => ipcRenderer.invoke(channel.lyrics.clearMatchPick, trackKey),
  // 网易云接入层
  netease: {
    getAccount: () => ipcRenderer.invoke(channel.netease.getAccount),
    loginWithCookie: cookie => ipcRenderer.invoke(channel.netease.loginWithCookie, cookie),
    logout: () => ipcRenderer.invoke(channel.netease.logout),
    qrCreate: () => ipcRenderer.invoke(channel.netease.qrCreate),
    qrCheck: key => ipcRenderer.invoke(channel.netease.qrCheck, key),
    search: {
      tracks: (keyword, limit, offset) =>
        ipcRenderer.invoke(channel.netease.search, { keyword, type: 1, limit, offset }),
      playlists: (keyword, limit, offset) =>
        ipcRenderer.invoke(channel.netease.search, { keyword, type: 1000, limit, offset }),
      albums: (keyword, limit, offset) =>
        ipcRenderer.invoke(channel.netease.search, { keyword, type: 10, limit, offset }),
    },
    hotPlaylists: limit => ipcRenderer.invoke(channel.netease.hotPlaylists, limit),
    playlistDetail: (id, offset, limit) => ipcRenderer.invoke(channel.netease.playlistDetail, id, offset, limit),
    albumDetail: id => ipcRenderer.invoke(channel.netease.albumDetail, id),
    myPlaylists: () => ipcRenderer.invoke(channel.netease.myPlaylists),
    myAlbums: () => ipcRenderer.invoke(channel.netease.myAlbums),
    songUrl: (id, level) => ipcRenderer.invoke(channel.netease.songUrl, id, level),
    lyric: id => ipcRenderer.invoke(channel.netease.lyric, id),
    like: (id, like) => ipcRenderer.invoke(channel.netease.like, id, like),
    likedIds: () => ipcRenderer.invoke(channel.netease.likedIds),
  },
  setProxySettings: proxySettings => ipcRenderer.invoke(channel.app.setProxySettings, proxySettings),
  scanLocalMusic: dirs => ipcRenderer.invoke(channel.localMusic.scan, dirs),
  deleteLocalMusicFile: filePath => ipcRenderer.invoke(channel.localMusic.deleteFile, filePath),
  // 监听来自主进程的导航事件，并将路径回调给渲染端
  navigate: cb => {
    const navigateHandler = (_: Electron.IpcRendererEvent, path: string) => {
      try {
        cb(path);
      } catch (error) {
        console.error("[preload] 导航回调失败:", error);
      }
    };

    ipcRenderer.on(channel.router.navigate, navigateHandler);

    return () => ipcRenderer.removeListener(channel.router.navigate, navigateHandler);
  },
  // 返回当前应用运行的平台（macos/windows/linux）
  getPlatform: () => {
    const platform: AppPlatForm =
      process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";

    return platform;
  },
  // 上报当前播放状态（播放/暂停）给主进程，用于更新任务栏缩略按钮
  updatePlaybackState: isPlaying => {
    try {
      ipcRenderer.send(channel.player.state, isPlaying);
    } catch (error) {
      console.error("[preload] 上报播放状态失败:", error);
    }
  },
  // 订阅主进程下发的快捷键命令
  onShortcutCommand: cb => {
    const handler = (_: Electron.IpcRendererEvent, cmd: ShortcutCommand) => {
      try {
        cb(cmd);
      } catch (error) {
        console.error("[preload] shortcut command callback failed:", error);
      }
    };

    ipcRenderer.on(channel.shortcut.triggered, handler);

    return () => ipcRenderer.removeListener(channel.shortcut.triggered, handler);
  },
  // 注册快捷键，返回是否注册成功
  registerShortcut: ({ id, accelerator }) => ipcRenderer.invoke(channel.shortcut.register, { id, accelerator }),
  // 注销指定快捷键
  unregisterShortcut: id => ipcRenderer.invoke(channel.shortcut.unregister, id),
  // 注册所有快捷键
  registerAllShortcuts: () => ipcRenderer.invoke(channel.shortcut.registerAll),
  // 注销所有快捷键
  unregisterAllShortcuts: () => ipcRenderer.invoke(channel.shortcut.unregisterAll),
  // 订阅主进程下发的播放器命令（上一首、下一首、播放/暂停）
  onPlayerCommand: cb => {
    // 先移除旧的监听，避免重复
    if (playerPrevHandler) {
      try {
        ipcRenderer.removeListener(channel.player.prev, playerPrevHandler);
      } catch (error) {
        console.error("[preload] 移除上一首监听器失败:", error);
      }
      playerPrevHandler = null;
    }
    if (playerNextHandler) {
      try {
        ipcRenderer.removeListener(channel.player.next, playerNextHandler);
      } catch (error) {
        console.error("[preload] 移除下一首监听器失败:", error);
      }
      playerNextHandler = null;
    }
    if (playerToggleHandler) {
      try {
        ipcRenderer.removeListener(channel.player.toggle, playerToggleHandler);
      } catch (error) {
        console.error("[preload] 移除播放/暂停监听器失败:", error);
      }
      playerToggleHandler = null;
    }
    playerPrevHandler = () => {
      try {
        cb("prev");
      } catch (error) {
        console.error("[preload] player prev 回调失败:", error);
      }
    };
    playerNextHandler = () => {
      try {
        cb("next");
      } catch (error) {
        console.error("[preload] player next 回调失败:", error);
      }
    };
    playerToggleHandler = () => {
      try {
        cb("toggle");
      } catch (error) {
        console.error("[preload] player toggle 回调失败:", error);
      }
    };

    ipcRenderer.on(channel.player.prev, playerPrevHandler);
    ipcRenderer.on(channel.player.next, playerNextHandler);
    ipcRenderer.on(channel.player.toggle, playerToggleHandler);

    return () => {
      if (playerPrevHandler) {
        ipcRenderer.removeListener(channel.player.prev, playerPrevHandler);
        playerPrevHandler = null;
      }
      if (playerNextHandler) {
        ipcRenderer.removeListener(channel.player.next, playerNextHandler);
        playerNextHandler = null;
      }
      if (playerToggleHandler) {
        ipcRenderer.removeListener(channel.player.toggle, playerToggleHandler);
        playerToggleHandler = null;
      }
    };
  },
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke(channel.app.getVersion),
  isDev: () => ipcRenderer.invoke(channel.app.isDev),
  // 桌面歌词
  desktopLyrics: {
    setEnabled: enabled => ipcRenderer.invoke(channel.desktopLyrics.setEnabled, enabled),
    isOpen: () => ipcRenderer.invoke(channel.desktopLyrics.isOpen),
    setLocked: locked => ipcRenderer.invoke(channel.desktopLyrics.setLocked, locked),
    setInteractive: interactive => ipcRenderer.invoke(channel.desktopLyrics.setInteractive, interactive),
    close: () => ipcRenderer.invoke(channel.desktopLyrics.close),
    /** 弹系统右键菜单（锁定 / 字号 / 翻译 / 罗马音 / 颜色 / 重置位置 / 关闭） */
    showMenu: () => ipcRenderer.invoke(channel.desktopLyrics.showMenu),
    /** 调字号，返回调整后的值 */
    adjustFontSize: (delta: number) => ipcRenderer.invoke(channel.desktopLyrics.adjustFontSize, delta),
    /** 窗口位置与尺寸重置回默认 */
    resetBounds: () => ipcRenderer.invoke(channel.desktopLyrics.resetBounds),
    /** 设置页改样式时调用，会同步给桌面歌词窗 */
    notifyStyleChanged: style => ipcRenderer.invoke(channel.desktopLyrics.styleChanged, style),
    /** 桌面歌词窗订阅样式变更 */
    onStyleChanged: cb => {
      const handler = (_, payload: DesktopLyricsStyle) => cb(payload);
      ipcRenderer.on(channel.desktopLyrics.styleChanged, handler);
      return () => ipcRenderer.removeListener(channel.desktopLyrics.styleChanged, handler);
    },
  },
  // 旧版 Biu 数据同步（B 站登录态）
  getLegacyImportStatus: () => ipcRenderer.invoke(channel.app.legacyImportStatus),
  importLegacyLogin: () => ipcRenderer.invoke(channel.app.importLegacyLogin),
  relaunchApp: () => ipcRenderer.invoke(channel.app.relaunchApp),
  // 切换 mini/主窗口
  toggleMiniPlayer: () => ipcRenderer.invoke(channel.window.toggleMini),
  // 最小化窗口
  minimizeWindow: () => ipcRenderer.send(channel.window.minimize),
  // 最大化/还原窗口
  toggleMaximizeWindow: () => ipcRenderer.send(channel.window.toggleMaximize),
  // 关闭窗口
  closeWindow: () => ipcRenderer.send(channel.window.close),
  // 判断窗口是否最大化
  isMaximized: () => ipcRenderer.invoke(channel.window.isMaximized),
  // 监听窗口最大化状态变化
  onWindowMaximizeChange: cb => {
    const maximizeHandler = () => cb(true);
    const unmaximizeHandler = () => cb(false);

    ipcRenderer.on(channel.window.maximize, maximizeHandler);
    ipcRenderer.on(channel.window.unmaximize, unmaximizeHandler);

    return () => {
      ipcRenderer.removeListener(channel.window.maximize, maximizeHandler);
      ipcRenderer.removeListener(channel.window.unmaximize, unmaximizeHandler);
    };
  },
  // 判断窗口是否全屏
  isFullScreen: () => ipcRenderer.invoke(channel.window.isFullScreen),
  // 监听窗口全屏状态变化
  onWindowFullScreenChange: cb => {
    const enterFullScreenHandler = () => cb(true);
    const leaveFullScreenHandler = () => cb(false);

    ipcRenderer.on(channel.window.enterFullScreen, enterFullScreenHandler);
    ipcRenderer.on(channel.window.leaveFullScreen, leaveFullScreenHandler);

    return () => {
      ipcRenderer.removeListener(channel.window.enterFullScreen, enterFullScreenHandler);
      ipcRenderer.removeListener(channel.window.leaveFullScreen, leaveFullScreenHandler);
    };
  },
  // 获取下载任务列表
  getMediaDownloadTaskList: () => ipcRenderer.invoke(channel.download.getList),
  // 添加文件下载任务
  addMediaDownloadTask: media => ipcRenderer.invoke(channel.download.add, media),
  /** 添加下载任务列表 */
  addMediaDownloadTaskList: mediaList => ipcRenderer.invoke(channel.download.addList, mediaList),
  // 暂停文件下载任务
  pauseMediaDownloadTask: id => ipcRenderer.invoke(channel.download.pause, id),
  // 恢复文件下载任务
  resumeMediaDownloadTask: id => ipcRenderer.invoke(channel.download.resume, id),
  // 重试文件下载任务
  retryMediaDownloadTask: id => ipcRenderer.invoke(channel.download.retry, id),
  // 取消文件下载任务
  cancelMediaDownloadTask: id => ipcRenderer.invoke(channel.download.cancel, id),
  // 监听文件下载任务状态变化
  syncMediaDownloadTaskList: cb => {
    const handler = (_, payload: MediaDownloadBroadcastPayload) => cb(payload);
    ipcRenderer.on(channel.download.sync, handler);
    return () => ipcRenderer.removeListener(channel.download.sync, handler);
  },
  // 清除文件下载任务列表
  clearMediaDownloadTaskList: () => ipcRenderer.invoke(channel.download.clear),
  // 切换开发者工具
  toggleDevTools: () => ipcRenderer.send(channel.window.toggleDevTools),
  // 开启/关闭窗口背景透明（macOS 会同时切换系统毛玻璃）
  setWindowTransparent: enabled => ipcRenderer.send(channel.window.setTransparent, enabled),
  // 选择一张本地图片作为背景，返回 { path, dataUrl }
  pickBackgroundImage: () => ipcRenderer.invoke(channel.window.pickBackgroundImage),
  // 按路径读回背景图（启动时用）
  readBackgroundImage: filePath => ipcRenderer.invoke(channel.window.readBackgroundImage, filePath),
  // app 打开动画：选一个本地视频 / 按路径读回视频字节（渲染端自己转 Blob URL）
  pickLaunchVideo: () => ipcRenderer.invoke(channel.window.pickLaunchVideo),
  readLaunchVideo: filePath => ipcRenderer.invoke(channel.window.readLaunchVideo, filePath),
};

contextBridge.exposeInMainWorld("electron", api);
