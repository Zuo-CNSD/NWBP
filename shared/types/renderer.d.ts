declare global {
  type AppPlatForm = "macos" | "windows" | "linux";

  type StoreName = keyof StoreDataMap;
  interface LocalMusicItem {
    id: string;
    path: string;
    dir: string;
    title: string;
    size: number;
    format: string;
    duration?: number;
    createdTime?: number;
  }

  interface ElectronAPI {
    /** 获取指定name的存储值 */
    getStore: <N extends StoreName>(name: N) => Promise<StoreDataMap[N] | undefined>;
    /** 设置指定name的存储值 */
    setStore: <N extends StoreName>(name: N, value: StoreDataMap[N]) => Promise<void>;
    /** 清除指定name的存储值 */
    clearStore: (name: StoreName) => Promise<void>;
    /** 打开系统目录选择对话框，返回选中的目录路径 */
    selectDirectory: (title?: string) => Promise<string | null>;
    /** 显示指定路径的文件 */
    showFileInFolder: (filePath: string) => Promise<boolean>;
    /** 打开系统文件选择对话框，返回选中的文件路径 */
    selectFile: () => Promise<string | null>;
    /** 打开本地目录（默认打开下载目录） */
    openDirectory: (path?: string) => Promise<boolean>;
    /** 在外部浏览器打开链接 */
    openExternal: (url: string) => Promise<boolean>;
    /** 获取本地安装的字体列表 */
    getFonts: () => Promise<IFontInfo[]>;
    /** 导航到指定路由 */
    navigate: (cb: (path: string) => void) => VoidFunction;
    /** 获取某个 cookie */
    getCookie: (key: string) => Promise<string | undefined>;
    /** 设置 cookie */
    setCookie: (name: string, value: string, expirationDate?: number) => Promise<void>;
    /** 搜索网易云歌曲 */
    searchNeteaseSongs: (params: SearchSongByNeteaseParams) => Promise<SearchSongByNeteaseResponse>;
    /** 获取网易云歌词 */
    getNeteaseLyrics: (params: GetLyricsByNeteaseParams) => Promise<GetLyricsByNeteaseResponse>;
    /** 在 LrcLib 搜索歌曲/歌词 */
    searchLrclibLyrics: (params: SearchSongByLrclibParams) => Promise<SearchSongByLrclibResponse[]>;
    /** 多源歌词聚合：返回各源候选（已解析 + 已打分，按分数降序） */
    resolveLyricsCandidates: (params: LyricsResolveParams) => Promise<LyricsResolveResult & { error?: string }>;
    /** 网易云歌曲按 id 直接取词 */
    resolveNeteaseLyricsById: (id: number, target: LyricsMatchTarget, trackKey: string) => Promise<LyricsResolveResult>;
    /** 翻译一批歌词行 */
    translateLyricsLines: (lines: string[], target?: string) => Promise<string[]>;
    /** 给一批歌词行生成罗马音 */
    romanizeLyricsLines: (lines: string[]) => Promise<string[]>;
    /** 读/写人工选定的歌词来源 */
    getLyricsMatchPick: (trackKey: string) => Promise<LyricsMatchRecord | undefined>;
    setLyricsMatchPick: (trackKey: string, pick: LyricsMatchRecord) => Promise<void>;
    clearLyricsMatchPick: (trackKey: string) => Promise<void>;
    /** 网易云接入层 */
    netease: {
      getAccount: () => Promise<NeteaseAccountInfo>;
      loginWithCookie: (cookie: string) => Promise<NeteaseAccountInfo>;
      logout: () => Promise<NeteaseAccountInfo>;
      qrCreate: () => Promise<NeteaseQrSession>;
      qrCheck: (key: string) => Promise<NeteaseQrCheckResult>;
      search: {
        tracks: (
          keyword: string,
          limit?: number,
          offset?: number,
        ) => Promise<{ tracks: NeteaseTrack[]; total: number }>;
        playlists: (keyword: string, limit?: number, offset?: number) => Promise<NeteasePlaylistInfo[]>;
        albums: (keyword: string, limit?: number, offset?: number) => Promise<NeteaseAlbumInfo[]>;
      };
      hotPlaylists: (limit?: number) => Promise<NeteasePlaylistInfo[]>;
      /** 分页取歌单曲目：一次最多 100 首，返回的 trackCount 是总数 */
      playlistDetail: (id: number, offset?: number, limit?: number) => Promise<NeteasePlaylistDetail>;
      albumDetail: (id: number) => Promise<NeteaseAlbumDetail>;
      myPlaylists: () => Promise<NeteasePlaylistInfo[]>;
      myAlbums: () => Promise<NeteaseAlbumInfo[]>;
      songUrl: (id: number, level?: "standard" | "exhigh" | "lossless") => Promise<{ url: string; level: string }>;
      lyric: (id: number) => Promise<NeteaseLyricResult>;
      like: (id: number, like: boolean) => Promise<boolean>;
      likedIds: () => Promise<number[]>;
    };
    /** 桌面歌词窗控制 */
    desktopLyrics: {
      setEnabled: (enabled: boolean) => Promise<boolean>;
      isOpen: () => Promise<boolean>;
      setLocked: (locked: boolean) => Promise<boolean>;
      /** 临时可交互（不写设置），锁定状态下悬停工具栏时用 */
      setInteractive: (interactive: boolean) => Promise<void>;
      close: () => Promise<void>;
      /** 弹系统右键菜单（锁定 / 字号 / 翻译 / 罗马音 / 颜色 / 重置位置 / 关闭） */
      showMenu: () => Promise<void>;
      /** 调字号（正数增大、负数减小），返回调整后的值 */
      adjustFontSize: (delta: number) => Promise<number>;
      /** 窗口位置与尺寸重置回默认 */
      resetBounds: () => Promise<void>;
      notifyStyleChanged: (style: DesktopLyricsStyle) => Promise<void>;
      onStyleChanged: (cb: (style: DesktopLyricsStyle) => void) => VoidFunction;
    };
    /** 旧版 Biu 数据同步状态 */
    getLegacyImportStatus: () => Promise<LegacyImportStatus>;
    /** 手动同步旧版登录态（需要重启生效） */
    importLegacyLogin: () => Promise<LegacyImportStatus & { imported: string[] }>;
    /** 重启应用 */
    relaunchApp: () => Promise<void>;
    /** 获取当前应用平台：macos | windows | linux */
    getPlatform: () => AppPlatForm;
    /** 更新网络代理设置 */
    setProxySettings: (proxySettings: ProxySettings) => Promise<void>;
    /** 上报当前播放状态到主进程（用于任务栏按钮切换） */
    updatePlaybackState: (isPlaying: boolean) => void;
    /** 订阅主进程下发的快捷键命令 */
    onShortcutCommand: (cb: (cmd: ShortcutCommand) => void) => VoidFunction;
    /** 注册快捷键，返回是否注册成功 */
    registerShortcut: ({ id, accelerator }: { id: ShortcutCommand; accelerator: string }) => Promise<boolean>;
    /** 注销指定快捷键 */
    unregisterShortcut: (id: ShortcutCommand) => Promise<void>;
    /** 注册所有快捷键 */
    registerAllShortcuts: () => Promise<void>;
    /** 注销所有快捷键 */
    unregisterAllShortcuts: () => Promise<void>;
    /** 订阅主进程下发的播放器命令（上一首、下一首、播放/暂停） */
    onPlayerCommand: (cb: (cmd: "prev" | "next" | "toggle") => void) => VoidFunction;
    /** 获取当前应用版本 */
    getAppVersion: () => Promise<string>;
    /** 判断是否为开发模式 */
    isDev: () => Promise<boolean>;
    /** 切换 mini/主窗口 */
    toggleMiniPlayer: () => Promise<void>;
    /** 最小化窗口 */
    minimizeWindow: () => void;
    /** 最大化/还原窗口 */
    toggleMaximizeWindow: () => void;
    /** 关闭窗口 */
    closeWindow: () => void;
    /** 判断窗口是否最大化 */
    isMaximized: () => Promise<boolean>;
    /** 监听窗口最大化状态变化 */
    onWindowMaximizeChange: (cb: (isMaximized: boolean) => void) => VoidFunction;
    /** 判断窗口是否全屏 */
    isFullScreen: () => Promise<boolean>;
    /** 监听窗口全屏状态变化 */
    onWindowFullScreenChange: (cb: (isFullScreen: boolean) => void) => VoidFunction;
    /** 切换开发者工具 */
    toggleDevTools: () => void;
    /** 开启/关闭窗口背景透明（macOS 会同时切换系统毛玻璃） */
    setWindowTransparent: (enabled: boolean) => void;
    /** 选择一张本地图片作为背景 */
    pickBackgroundImage: () => Promise<{ path: string; dataUrl: string | null } | null>;
    /** 按路径读回背景图（启动时用），失败返回 null */
    readBackgroundImage: (filePath: string) => Promise<string | null>;
    /** 选一个本地视频当 app 开场动画；只回路径与体积 */
    pickLaunchVideo: () => Promise<{ path: string; size: number; tooLarge: boolean } | null>;
    /** 按路径读回开场视频的字节（渲染端自己转 Blob URL），失败返回 null */
    readLaunchVideo: (filePath: string) => Promise<{ mime: string; data: Uint8Array } | null>;
    /** 获取下载任务列表 */
    getMediaDownloadTaskList: () => Promise<MediaDownloadTask[]>;
    /** 同步下载任务列表 */
    syncMediaDownloadTaskList: (cb: (payload: MediaDownloadBroadcastPayload) => void) => VoidFunction;
    /** 添加下载任务 */
    addMediaDownloadTask: (media: MediaDownloadInfo) => Promise<void>;
    /** 添加下载任务列表 */
    addMediaDownloadTaskList: (mediaList: MediaDownloadInfo[]) => Promise<void>;
    /** 暂停下载任务 */
    pauseMediaDownloadTask: (id: string) => Promise<void>;
    /** 恢复下载任务 */
    resumeMediaDownloadTask: (id: string) => Promise<void>;
    /** 取消下载任务 */
    cancelMediaDownloadTask: (id: string) => Promise<void>;
    /** 重试下载任务 */
    retryMediaDownloadTask: (id: string) => Promise<void>;
    /** 清除下载任务列表 */
    clearMediaDownloadTaskList: () => Promise<void>;
    /** 扫描本地音乐文件 */
    scanLocalMusic: (dirs: string[]) => Promise<LocalMusicItem[]>;
    /** 删除本地音乐文件 */
    deleteLocalMusicFile: (filePath: string) => Promise<boolean>;
  }

  interface Window {
    electron: ElectronAPI;
  }
}

export {};
