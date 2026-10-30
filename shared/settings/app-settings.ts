export const defaultAppSettings: AppSettings = {
  autoStart: false,
  closeWindowOption: "hide",
  // 默认中文。老用户升级后配置文件里没有这一项，electron-store 会用这个默认值补上。
  language: "zh-CN",
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
  /*
   * 主色：留空 = 跟随主题。
   *
   * Beta 9 之前默认是一串写死的品牌绿（`#1ed760`），存进配置后就算主题换了也不变，
   * 想改回黑白还得自己去调色盘里点。留空之后，浅色主题用近黑、深色主题用近白，
   * 用户真选了颜色才是一串 hex —— 「默认」和「用户改过」从此能区分开。
   */
  primaryColor: "",
  backgroundColor: "",
  audioQuality: "auto",
  /*
   * 歌曲音源：默认走 B 站（原来的行为）。
   * 换成 netease 之后，搜索页会用网易云的接口找歌，播的也是网易云的音源，
   * 歌词直接取网易云那份（含逐字时间轴）。
   */
  musicSource: "bilibili",
  /*
   * 展示模式：默认「融合」—— 和 Beta 8 之前的行为一致（两家菜单都在）。
   * 单选模式只是把不相关的那一组收起来，不动任何数据。
   */
  sourceMode: "mixed",
  hiddenMenuKeys: [],
  displayMode: "list",
  ffmpegPath: "",
  themeMode: "light",
  /*
   * app 打开动画：启动时盖住整窗的开场画面。
   * 默认开（logo 淡入），想直接进界面就在设置里选「无动画」。
   */
  appLaunchAnimation: "logo",
  appLaunchAnimationDuration: 1200,
  appLaunchAnimationVideo: "",
  showSearchHistory: true,
  /** 新手引导只在第一次启动弹，看完/跳过都写 true */
  onboardingDone: false,
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
