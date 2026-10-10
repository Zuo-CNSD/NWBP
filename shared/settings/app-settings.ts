export const defaultAppSettings: AppSettings = {
  autoStart: false,
  closeWindowOption: "hide",
  fontFamily: "system-ui",
  // 默认圆角（基准档位，对应 HeroUI 的 medium）。14px 让整体更圆润，
  // 旧版本默认值是 8px，会在 settings store 里做一次迁移
  borderRadius: 14,
  liquidGlass: true,
  glassOpacity: 65,
  backgroundImage: "",
  backgroundImageBlur: 0,
  backgroundImageDim: 0.25,
  windowTransparent: false,
  downloadPath: "",
  primaryColor: "#1ed760",
  backgroundColor: "",
  audioQuality: "auto",
  /*
   * 歌曲音源：默认走 B 站（原来的行为）。
   * 换成 netease 之后，搜索页会用网易云的接口找歌，播的也是网易云的音源，
   * 歌词直接取网易云那份（含逐字时间轴）。
   */
  musicSource: "bilibili",
  hiddenMenuKeys: [],
  displayMode: "list",
  ffmpegPath: "",
  themeMode: "system",
  pageTransition: "none",
  /*
   * app 打开动画：启动时盖住整窗的开场画面。
   * 默认开（logo 淡入），想直接进界面就在设置里选「无动画」。
   */
  appLaunchAnimation: "logo",
  appLaunchAnimationDuration: 1200,
  appLaunchAnimationVideo: "",
  showSearchHistory: true,
  proxySettings: {
    type: "none",
    host: "",
    port: undefined,
    username: "",
    password: "",
  },
  sideMenuCollapsed: false,
  sideMenuWidth: 200,
  sideMenuCollectionFolded: {
    created: false,
    collected: false,
  },
  reportPlayHistory: true,
  localMusicDirs: [],
  desktopLyrics: false,
  desktopLyricsFontSize: 34,
  desktopLyricsColor: "#ffffff",
  /*
   * 底板三选一：
   *   transparent → 不画底板，只有字（默认）
   *   color       → 纯色底板，颜色由 desktopLyricsBackgroundColor 决定
   *   image       → 自定义背景图，路径在 desktopLyricsBackgroundImage
   * 底板的「不透明度」对三种模式都生效（transparent 模式下无意义）。
   */
  desktopLyricsBackgroundMode: "transparent",
  desktopLyricsBackgroundOpacity: 0,
  desktopLyricsBackgroundColor: "#0e0e12",
  desktopLyricsBackgroundImage: "",
  /** 自定义背景图的模糊半径（px），糊一点字更好读 */
  desktopLyricsBackgroundImageBlur: 8,
  /*
   * 文字与底板**各自独立**：
   *   底板 0%   + 文字 100%  → 只有字，完全透明（默认）
   *   底板 100% + 文字 100%  → 实心底板，任何壁纸上都读得清
   *   底板 100% + 文字 60%   → 实心底板 + 半透明文字
   */
  desktopLyricsTextOpacity: 100,
  desktopLyricsShowTranslation: true,
  desktopLyricsShowRomanization: false,
  /*
   * 歌词上方那条频谱：默认开。
   * 音频分析在主窗口做，柱高通过 BroadcastChannel 发给歌词窗
   * （歌词窗自己拿不到音频），所以这条开关要主窗口和歌词窗都能看到。
   */
  desktopLyricsSpectrum: true,
  /** 播放栏上方的动态音频条，默认开 */
  playbarSpectrum: true,
  desktopLyricsBounds: null,
  /*
   * 默认**不锁定**。
   * 锁定 = 整窗鼠标穿透，那种状态下歌词根本拖不动、右键菜单也点不出来 ——
   * 作为默认值体验太差，改成「想要穿透再自己锁」。
   */
  desktopLyricsLocked: false,
  /** 上面那条默认值改动的一次性迁移标记，见 electron/store.ts */
  desktopLyricsLockMigrated: false,
};
