import { readSpectrumBars, SPECTRUM_BAR_COUNT } from "@/common/utils/spectrum";
import { useLyrics } from "@/store/lyrics";
import { usePlayList } from "@/store/play-list";
import { usePlayProgress } from "@/store/play-progress";
import { useSettings } from "@/store/settings";

/**
 * 主窗口 → 桌面歌词窗 的同步通道。
 *
 * 两个窗是独立的渲染进程，用 BroadcastChannel 通信（迷你播放器也是这套）。
 *
 * 分工：**主窗口解析歌词，桌面歌词窗只负责画**。
 * 这样歌词只解析一次、只缓存一次，两个窗口的逐字高亮进度天然一致；
 * 反过来让桌面歌词窗自己解析的话，会出现两次网络请求和潜在的两份结果。
 *
 * 消息刻意拆成三条：
 *  - `lines` 只在歌词变化时发（一首歌一次），避免把几百行歌词按 4Hz 反复克隆；
 *  - `tick` 只带时间，频率跟着播放进度走；
 *  - `spectrum` 是频谱柱高，只在「桌面歌词开着 + 频谱条开着 + 正在播」时才发。
 */

export const DESKTOP_LYRICS_CHANNEL = "nwbp-desktop-lyrics-channel";

export type DesktopLyricsMessage =
  | { kind: "lines"; lines: LyricSyncedLine[]; hasTrack: boolean; loading: boolean }
  | { kind: "tick"; currentMs: number; isPlaying: boolean }
  /** 归一化柱高（0–1），长度固定 SPECTRUM_BAR_COUNT；空数组 = 停住（画基准行） */
  | { kind: "spectrum"; bars: number[] }
  /**
   * 歌词窗反过来「要」一帧柱高。
   *
   * 兜底用：主窗口的推送靠定时器，而 Chromium 会冻结后台窗口的定时器 ——
   * 主窗口被全屏盖住或缩到 Dock 时推送会停。但**消息投递不受节流影响**
   * （歌词的 tick 就是这么一路活下来的），所以由可见的歌词窗来催一帧。
   * 推送正常时这条消息一次都不会发。
   */
  | { kind: "request-spectrum" };

export const createDesktopLyricsChannel = () => new BroadcastChannel(DESKTOP_LYRICS_CHANNEL);

let started = false;
let channel: BroadcastChannel | null = null;
let unsubscribeLines: VoidFunction | null = null;
let unsubscribePlayList: VoidFunction | null = null;
let unsubscribeProgress: VoidFunction | null = null;
let unsubscribeSettings: VoidFunction | null = null;

const post = (message: DesktopLyricsMessage) => channel?.postMessage(message);

const readBaseMs = () => usePlayProgress.getState().currentTime * 1000 + useLyrics.getState().offset;

/*
 * ---- 频谱广播 ----
 *
 * 音频元素和分析节点都在**主窗口**里，桌面歌词窗只是个独立渲染进程、
 * 自己没有音频可分析 —— 所以柱高必须在主窗口算好再发过去。
 *
 * 只在「桌面歌词开着 + 频谱条开着 + 正在播」时才开循环。暂停时补发一帧全 0，
 * 让柱子收回基准行 —— 不然会僵在半空中，看着像卡住了。
 *
 * ⚠️ 这里用 **setInterval 而不是 requestAnimationFrame**，别改回去。
 * 用户报过「只有主窗口在前台时频谱才动，全屏走了或者缩到 Dock 就不动」：
 * 那是 Chromium 在窗口不可见时冻住了后台渲染进程的动画帧。数据是 30fps 的
 * 定频推送、不需要跟屏幕刷新对齐，用定时器更合适；配合主窗口
 * webPreferences 里的 backgroundThrottling:false 才能一直在后台跑。
 * 就算节流没关掉，定时器也只是被拉稀到 1s（还在动），rAF 则是直接 0（完全冻住）。
 */
const SPECTRUM_INTERVAL_MS = 33; // ≈30fps。跨进程 postMessage 没必要按帧发

/** 静音帧：全 0 → 每根柱子都落在最低高度上，看着就是一条基准虚线 */
const IDLE_SPECTRUM = new Array<number>(SPECTRUM_BAR_COUNT).fill(0);

let spectrumTimer: ReturnType<typeof setInterval> | null = null;

const postSpectrumIdle = () => post({ kind: "spectrum", bars: IDLE_SPECTRUM });

const stopSpectrum = () => {
  if (spectrumTimer !== null) {
    clearInterval(spectrumTimer);
    spectrumTimer = null;
  }
  postSpectrumIdle();
};

const spectrumTick = () => {
  post({ kind: "spectrum", bars: readSpectrumBars() });
};

/** 按「设置 + 播放状态」决定频谱循环开还是关 */
const syncSpectrum = () => {
  if (!channel) return;

  const { desktopLyrics, desktopLyricsSpectrum } = useSettings.getState();
  const shouldRun = Boolean(desktopLyrics) && desktopLyricsSpectrum !== false && usePlayList.getState().isPlaying;

  if (shouldRun) {
    if (spectrumTimer === null) spectrumTimer = setInterval(spectrumTick, SPECTRUM_INTERVAL_MS);
    return;
  }

  stopSpectrum();
};

/** 把当前歌词与播放状态推给桌面歌词窗（新开的窗会主动要一次） */
const postSnapshot = () => {
  const { lines, isLoading } = useLyrics.getState();
  post({ kind: "lines", lines, hasTrack: Boolean(usePlayList.getState().playId), loading: isLoading });
  post({ kind: "tick", currentMs: readBaseMs(), isPlaying: usePlayList.getState().isPlaying });
  // 循环没在跑时补一帧基准，新开的窗才能立刻画出那条底线，而不是空白
  if (spectrumTimer === null) postSpectrumIdle();
  syncSpectrum();
};

export function startDesktopLyricsBroadcast() {
  if (started) return;
  started = true;

  channel = createDesktopLyricsChannel();

  // 桌面歌词窗刚打开时会来要一次全量快照
  channel.onmessage = event => {
    const kind = (event.data as { kind?: string })?.kind;
    if (kind === "request-snapshot") postSnapshot();
    // 兜底：主窗口的推送定时器被冻住时，由歌词窗催一帧
    else if (kind === "request-spectrum") spectrumTick();
  };

  unsubscribeLines = useLyrics.subscribe((state, prev) => {
    if (state.lines !== prev.lines || state.isLoading !== prev.isLoading) {
      post({
        kind: "lines",
        lines: state.lines,
        hasTrack: Boolean(usePlayList.getState().playId),
        loading: state.isLoading,
      });
    }
  });

  unsubscribePlayList = usePlayList.subscribe((state, prev) => {
    if (state.playId !== prev.playId) postSnapshot();
    else if (state.isPlaying !== prev.isPlaying) {
      post({ kind: "tick", currentMs: readBaseMs(), isPlaying: state.isPlaying });
      // 播放状态变了 = 频谱循环该开或该关
      syncSpectrum();
    }
  });

  unsubscribeProgress = usePlayProgress.subscribe((state, prev) => {
    if (state.currentTime !== prev.currentTime) {
      post({ kind: "tick", currentMs: readBaseMs(), isPlaying: usePlayList.getState().isPlaying });
    }
  });

  // 频谱条开关是设置项，改了要立刻生效（不用等下次开关窗）
  unsubscribeSettings = useSettings.subscribe((state, prev) => {
    if (state.desktopLyrics !== prev.desktopLyrics || state.desktopLyricsSpectrum !== prev.desktopLyricsSpectrum) {
      syncSpectrum();
    }
  });

  postSnapshot();
}

export function stopDesktopLyricsBroadcast() {
  unsubscribeLines?.();
  unsubscribeLines = null;
  unsubscribePlayList?.();
  unsubscribePlayList = null;
  unsubscribeProgress?.();
  unsubscribeProgress = null;
  unsubscribeSettings?.();
  unsubscribeSettings = null;

  if (spectrumTimer !== null) {
    clearInterval(spectrumTimer);
    spectrumTimer = null;
  }

  channel?.close();
  channel = null;
  started = false;
}
