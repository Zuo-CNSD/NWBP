/**
 * 桌面歌词（置顶悬浮歌词窗）。
 *
 * 主窗口和桌面歌词窗是两个独立的渲染进程，靠 BroadcastChannel 同步：
 * 主窗口负责解析歌词并广播「行 + 当前时间」，桌面歌词窗只负责画。
 * 这样歌词只解析一次，两个窗的逐字高亮天然同步。
 */

/**
 * 桌面歌词的完整状态，主进程推给两个窗口。
 *
 * 叫 "Style" 是历史原因，实际它还带了开关与锁定 —— 因为这两个值只有主进程
 * 是准的（比如用户在歌词条上直接点 ×，主进程才知道窗没了），
 * 渲染端各自的 zustand store 互相看不见，必须靠主进程广播对齐。
 */
/** 桌面歌词底板的三种模式 */
type DesktopLyricsBackgroundMode = "transparent" | "color" | "image";

interface DesktopLyricsStyle {
  fontSize: number;
  color: string;
  /** 底板模式：透明 / 纯色 / 自定义背景图 */
  backgroundMode: DesktopLyricsBackgroundMode;
  /** 底板不透明度（0–100），对纯色与自定义背景图都生效 */
  backgroundOpacity: number;
  /** 纯色底板的颜色 */
  backgroundColor: string;
  /** 自定义背景图的本地路径；渲染端自己去读成 data URL */
  backgroundImage: string;
  /** 背景图模糊半径（px） */
  backgroundImageBlur: number;
  /** 文字不透明度（0–100），与底板互不影响 */
  textOpacity: number;
  showTranslation: boolean;
  showRomanization: boolean;
  /** 歌词上方是否显示频谱条 */
  spectrum: boolean;
  /** 设置里的开关（窗口是否应该开着） */
  enabled: boolean;
  /** 锁定 = 鼠标穿透 */
  locked: boolean;
}

/** 主窗口 → 桌面歌词窗 的广播负载 */
interface DesktopLyricsBroadcast {
  /** 归一化后的歌词行（含逐字时间轴） */
  lines: LyricSyncedLine[];
  /** 当前播放时间（毫秒，已含用户在播放器里设的偏移） */
  currentMs: number;
  isPlaying: boolean;
  /** 当前有没有在放歌 */
  hasTrack: boolean;
}
