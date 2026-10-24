/**
 * 界面语言。
 *
 * `zh-CN` 是**基准语言**：源码里写的中文原文就是 key，词典查不到就回落成它。
 * 所以新增语言时不必给中文建词典，只要保证翻译包覆盖到即可。
 */
type Language = "zh-CN" | "en" | "ja" | "ko";

type AudioQuality = "auto" | "lossless" | "high" | "medium" | "low";
type ThemeMode = "system" | "light" | "dark";

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
 * 界面展示模式（Beta 9 起取代「首选音乐源」作为导航的主开关）。
 *
 * - `netease`  网易云模式：侧栏只留通用组 + 网易云
 * - `bilibili` 哔哩哔哩模式：侧栏只留通用组 + 哔哩哔哩（含收藏夹）
 * - `mixed`    融合模式：两家都在，顺序跟 `musicSource`
 *
 * 只影响**导航展示与搜索的默认范围**，不改变任何一家自己的数据与功能；
 * 切模式也不会动播放队列。
 */
type SourceMode = "netease" | "bilibili" | "mixed";

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
  /** 界面语言（zh-CN / en / ja / ko），主进程也读这一项来翻原生菜单 */
  language: Language;
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
  /**
   * **首选音乐源**（Beta 8 起含义扩大，Beta 9 起退居「融合模式下的默认音源」）。
   *
   * 负责：
   * ① 融合模式下两个平台分组的先后顺序；
   * ② 「我喜欢的音乐」进哪一家的收藏页；
   * ③ 融合模式下搜索默认走哪一家。
   *
   * **不再决定侧栏显示哪些分组** —— 那是 `sourceMode` 的事。
   * 单选模式下这里仍然会被读取（当作"就是那一家的默认"），所以不必强行同步。
   */
  musicSource: MusicSource;
  /**
   * 界面展示模式。默认 `mixed`（两家都显示），
   * 选了单选模式后侧栏只留对应那一组。
   */
  sourceMode: SourceMode;
  hiddenMenuKeys: string[];
  displayMode: "card" | "list" | "compact";
  ffmpegPath?: string;
  themeMode: ThemeMode;
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
  /** 首次启动的新手引导是否已看过（跳过也算看过） */
  onboardingDone: boolean;
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
