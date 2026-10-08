export const channel = {
  store: {
    getSettings: "settings:get",
    setSettings: "settings:set",
    clearSettings: "settings:clear",
    get: "store:get",
    set: "store:set",
    clear: "store:clear",
  },
  dialog: {
    selectDirectory: "dialog:select-directory",
    showFileInFolder: "dialog:show-file-in-folder",
    selectFile: "dialog:select-file",
    openDirectory: "dialog:open-directory",
    openExternal: "dialog:open-external",
  },
  font: {
    getFonts: "font:get-fonts",
  },
  file: {
    getSize: "file:get-size",
  },
  download: {
    getList: "download:get-list",
    getDownloadData: "download:get-download-data",
    add: "download:add",
    addList: "download:add-list",
    pause: "download:pause",
    resume: "download:resume",
    cancel: "download:cancel",
    retry: "download:retry",
    sync: "download:sync",
    clear: "download:clear",
  },
  lyrics: {
    searchNeteaseSongs: "lyrics:netease-search",
    getNeteaseLyrics: "lyrics:netease-lyrics",
    searchLrclib: "lyrics:lrclib-search",
    /** 多源聚合：一次把各源候选（含逐字/翻译/罗马音原文）都拿回来 */
    resolveCandidates: "lyrics:resolve-candidates",
    /** 网易云歌曲按 id 直接取词 */
    resolveNeteaseById: "lyrics:resolve-netease-by-id",
    /** 翻译一批歌词行（Google 端点，失败静默降级） */
    translateLines: "lyrics:translate-lines",
    /** 罗马音（中文拼音 / 日文假名 + 罗马字） */
    romanizeLines: "lyrics:romanize-lines",
    /** 读取/写入人工选定的歌词来源 */
    getMatchPick: "lyrics:get-match-pick",
    setMatchPick: "lyrics:set-match-pick",
    clearMatchPick: "lyrics:clear-match-pick",
  },
  netease: {
    getAccount: "netease:get-account",
    loginWithCookie: "netease:login-with-cookie",
    logout: "netease:logout",
    qrCreate: "netease:qr-create",
    qrCheck: "netease:qr-check",
    search: "netease:search",
    hotPlaylists: "netease:hot-playlists",
    playlistDetail: "netease:playlist-detail",
    albumDetail: "netease:album-detail",
    myPlaylists: "netease:my-playlists",
    myAlbums: "netease:my-albums",
    songUrl: "netease:song-url",
    lyric: "netease:lyric",
    like: "netease:like",
    likedIds: "netease:liked-ids",
  },
  router: {
    navigate: "router:navigate",
  },
  http: {
    get: "http:get",
    post: "http:post",
  },
  player: {
    state: "player:state",
    prev: "player:prev",
    next: "player:next",
    toggle: "player:toggle",
  },
  shortcut: {
    triggered: "shortcut:triggered",
    register: "shortcut:register",
    unregister: "shortcut:unregister",
    registerAll: "shortcut:register-all",
    unregisterAll: "shortcut:unregister-all",
  },
  app: {
    getVersion: "app:get-version",
    isDev: "app:is-dev",
    setProxySettings: "app:set-proxy-settings",
    legacyImportStatus: "app:legacy-import-status",
    importLegacyLogin: "app:import-legacy-login",
    relaunchApp: "app:relaunch",
  },
  cookie: {
    get: "cookie:get",
    set: "cookie:set",
  },
  localMusic: {
    scan: "local-music:scan",
    deleteFile: "local-music:delete-file",
  },
  window: {
    toggleMini: "window:toggle-mini",
    minimize: "window:minimize",
    toggleMaximize: "window:toggle-maximize",
    close: "window:close",
    maximize: "window:maximize",
    unmaximize: "window:unmaximize",
    isMaximized: "window:is-maximized",
    enterFullScreen: "window:enter-full-screen",
    leaveFullScreen: "window:leave-full-screen",
    isFullScreen: "window:is-full-screen",
    toggleDevTools: "window:toggle-dev-tools",
    setTransparent: "window:set-transparent",
    pickBackgroundImage: "window:pick-background-image",
    readBackgroundImage: "window:read-background-image",
    pickLaunchVideo: "window:pick-launch-video",
    readLaunchVideo: "window:read-launch-video",
  },
  desktopLyrics: {
    /** 开/关桌面歌词窗（同时写进设置，下次启动自动恢复） */
    setEnabled: "desktop-lyrics:set-enabled",
    /** 当前是否开着 */
    isOpen: "desktop-lyrics:is-open",
    /** 锁定：锁定后鼠标穿透 */
    setLocked: "desktop-lyrics:set-locked",
    /**
     * 临时可交互（不写设置）。
     * 锁定状态下鼠标是穿透的，但鼠标移到工具栏上时要能点得到按钮，
     * 所以在窗口里做「悬停 → 临时关掉穿透，移开 → 恢复穿透」。
     */
    setInteractive: "desktop-lyrics:set-interactive",
    /** 关窗（只关不写设置，用于「临时关掉」） */
    close: "desktop-lyrics:close",
    /**
     * 弹系统右键菜单（锁定 / 字号 / 翻译 / 罗马音 / 颜色 / 重置位置 / 关闭）。
     * 用原生菜单而不是自绘 DOM 菜单，是因为歌词窗只有 160px 高，
     * 自绘菜单会被窗口边界裁掉。
     */
    showMenu: "desktop-lyrics:show-menu",
    /** 调整字号（+1 档 / -1 档），供滚轮与菜单共用 */
    adjustFontSize: "desktop-lyrics:adjust-font-size",
    /** 窗口位置与尺寸重置回默认 */
    resetBounds: "desktop-lyrics:reset-bounds",
    /** 主进程 → 桌面歌词窗：字号/颜色等样式变更 */
    styleChanged: "desktop-lyrics:style-changed",
  },
};
