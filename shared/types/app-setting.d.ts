type AudioQuality = "auto" | "lossless" | "high" | "medium" | "low";
type ThemeMode = "system" | "light" | "dark";
type PageTransition = "none" | "fade" | "slide" | "scale" | "slideUp";

/**
 * 歌曲音源：搜索和播放走哪一家。
 * - `bilibili` 默认值，站内视频/音频（含收藏夹、稍后再看这些账号数据）
 * - `netease`  网易云音乐的单曲（走已内置的网易云接口层）
 *
 * 注意它只影响「找歌」这条链（搜索 → 播放 → 歌词）。
 * 推荐音乐 / 历史记录 / 关注 / 稍后再看这些是 B 站账号数据，不跟着切。
 */
type MusicSource = "bilibili" | "netease";

/**
 * app 打开动画（启动时盖住整窗的那层开场画面）。
 * - `none`  关掉，直接进主界面
 * - `fade`  只做一次淡入淡出，不出现图案
 * - `logo`  app 图标淡入 + 轻微上浮
 * - `pulse` app 图标先呼吸再放大淡出（带一圈扩散光环）
 * - `video` 播一遍用户自己选的视频
 */
type AppLaunchAnimation = "none" | "fade" | "logo" | "pulse" | "video";

type ProxyType = "none" | "http" | "socks4" | "socks5";

interface ProxySettings {
  type: ProxyType;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

interface AppSettings {
  fontFamily: string;
  primaryColor: string;
  /** 自定义背景色（为空表示使用主题默认） */
  backgroundColor: string;
  borderRadius: number;
  /** 液态玻璃外观：半透明毛玻璃面板 + 流动背景 */
  liquidGlass: boolean;
  /** 玻璃透明度 0-100，越大越透（面板越"薄"） */
  glassOpacity: number;
  /** 自定义背景图（本地图片的绝对路径，空表示不用图片） */
  backgroundImage: string;
  /** 背景图模糊度（px） */
  backgroundImageBlur: number;
  /** 背景图压暗遮罩强度 0-1，越大文字越清楚 */
  backgroundImageDim: number;
  /** 窗口背景透明：桌面直接透过来，macOS 上配合系统毛玻璃 */
  windowTransparent: boolean;
  downloadPath?: string;
  closeWindowOption: "hide" | "exit";
  autoStart: boolean;
  audioQuality: AudioQuality;
  /** 歌曲音源：搜索与播放走 B 站还是网易云 */
  musicSource: MusicSource;
  hiddenMenuKeys: string[];
  displayMode: "card" | "list" | "compact";
  ffmpegPath?: string;
  themeMode: ThemeMode;
  pageTransition: PageTransition;
  /** app 打开动画（启动时盖住整窗的开场画面） */
  appLaunchAnimation: AppLaunchAnimation;
  /**
   * 内置开场动画的时长（ms）。
   * `video` 模式下不生效 —— 那种模式以视频自己的长度为准。
   */
  appLaunchAnimationDuration: number;
  /** 自定义开场视频的本地路径（空字符串 = 还没选） */
  appLaunchAnimationVideo: string;
  showSearchHistory: boolean;
  proxySettings: ProxySettings;
  sideMenuCollapsed: boolean;
  sideMenuWidth: number;
  sideMenuCollectionFolded: {
    created: boolean;
    collected: boolean;
  };
  reportPlayHistory: boolean;
  /** 本地音乐目录列表 */
  localMusicDirs: string[];
  /** 桌面歌词：置顶悬浮的歌词窗 */
  desktopLyrics: boolean;
  /** 桌面歌词字号（px） */
  desktopLyricsFontSize: number;
  /** 桌面歌词文字颜色 */
  desktopLyricsColor: string;
  /** 桌面歌词底板模式：透明 / 纯色 / 自定义背景图 */
  desktopLyricsBackgroundMode: DesktopLyricsBackgroundMode;
  /**
   * 桌面歌词**底板**不透明度（0–100），对纯色与自定义背景图都生效。
   * 和 desktopLyricsTextOpacity 相互独立，可以任意组合。
   */
  desktopLyricsBackgroundOpacity: number;
  /** 纯色底板的颜色 */
  desktopLyricsBackgroundColor: string;
  /** 自定义背景图的本地路径（空字符串 = 还没选） */
  desktopLyricsBackgroundImage: string;
  /** 自定义背景图的模糊半径（px） */
  desktopLyricsBackgroundImageBlur: number;
  /** 桌面歌词**文字**不透明度（0–100），只作用于歌词文字本身，不影响底板 */
  desktopLyricsTextOpacity: number;
  /** 桌面歌词是否显示翻译副行 */
  desktopLyricsShowTranslation: boolean;
  /** 桌面歌词是否显示罗马音副行 */
  desktopLyricsShowRomanization: boolean;
  /** 播放栏上方是否显示动态音频条（频谱） */
  playbarSpectrum: boolean;
  /**
   * 桌面歌词上方是否显示频谱条。
   * 音频在主窗口分析（歌词窗没有音频），柱高走 BroadcastChannel 广播过去。
   */
  desktopLyricsSpectrum: boolean;
  /** 桌面歌词窗口位置与尺寸，null 表示还没拖过、用默认位置 */
  desktopLyricsBounds: { x: number; y: number; width: number; height: number } | null;
  /** 桌面歌词锁定：锁定后鼠标穿透，不会挡住下面的操作 */
  desktopLyricsLocked: boolean;
  /**
   * 「桌面歌词默认不锁定」这次改动的一次性迁移标记。
   * 用标记而不是直接判断 desktopLyricsLocked === true，
   * 否则用户手动上锁后每次重启都会被改回去。
   */
  desktopLyricsLockMigrated: boolean;
}
