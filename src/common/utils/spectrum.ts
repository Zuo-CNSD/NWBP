import { audio as audioElement } from "@/store/play-list";

/**
 * 频谱的采集与绘制。
 *
 * 有两个使用方：
 *  - 全屏播放器的 AudioWaveform —— 自己采、自己画；
 *  - 桌面歌词窗 —— 画的是主窗口通过 BroadcastChannel 送过来的数据（那个窗里没有音频）。
 *
 * 采集必须**共用同一套 Web Audio 单例**：`createMediaElementSource` 对同一个
 * <audio> 元素只能调一次，第二次会抛 InvalidStateError。所以 AudioContext /
 * AnalyserNode / MediaElementAudioSourceNode 都只能建一份，谁先要谁负责建。
 */

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;

/**
 * 柱子数量。
 * 主窗口按这个数量降采样后广播，两个窗画出来的形状才会一致 ——
 * 所以它是个约定值，不接受各画各的。
 */
export const SPECTRUM_BAR_COUNT = 48;

/** 拿到（必要时先建好）分析节点。窗口里没有音频元素时返回 null */
export function ensureAudioAnalyser(): AnalyserNode | null {
  if (!audioElement) return null;

  if (!audioContext) {
    try {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContext = new Ctor();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;

      source = audioContext.createMediaElementSource(audioElement);
      source.connect(analyser);
      // 必须再接回 destination，否则声音就被 analyser 吞掉了（只剩频谱没声音）
      analyser.connect(audioContext.destination);
    } catch (error) {
      console.warn("创建音频分析节点失败：", error);
      analyser = null;
    }
  }

  // 自动播放策略会把新建的 context 挂成 suspended，恢复一下才有数据
  if (audioContext?.state === "suspended") void audioContext.resume();

  return analyser;
}

/**
 * 读一帧频谱，返回 SPECTRUM_BAR_COUNT 个 0–1 的归一化值。
 *
 * 取法与全屏播放器原来的一致（低频在左、高频在右）：
 *  - 只取前 60% 的频段，音乐能量基本都在这一段（fftSize=512 时覆盖到约 13kHz）；
 *  - 右侧做线性增益补偿 —— 高频天然比低频安静得多，不补的话右半截永远是贴底的。
 */
export function readSpectrumBars(barCount = SPECTRUM_BAR_COUNT): number[] {
  const node = ensureAudioAnalyser();
  if (!node) return new Array<number>(barCount).fill(0);

  const data = new Uint8Array(node.frequencyBinCount);
  node.getByteFrequencyData(data);

  const useful = Math.floor(node.frequencyBinCount * 0.6);
  const bars = new Array<number>(barCount);

  for (let i = 0; i < barCount; i++) {
    const value = data[Math.floor((i / barCount) * useful)] ?? 0;
    bars[i] = Math.min(1, (value / 255) * (1 + i / barCount));
  }

  return bars;
}

interface DrawOptions {
  /** 逻辑高度（px）。宽度取 canvas 的 CSS 宽度 */
  height: number;
  color: string;
  /** 最低柱高。不为 0 是为了留一条「基准行」，静音时看着像一条虚线 */
  minBarHeight?: number;
}

/**
 * 把归一化的柱子画到 canvas 上。两个窗共用同一份实现，保证长得一样。
 *
 * 两处细节：
 *  - **按 devicePixelRatio 放大画布**，否则 Retina 上边缘是糊的；
 *    对应的 CSS 尺寸由使用方自己给（class 或 style），这里只读 clientWidth。
 *  - 圆角半径要同时受半宽和半高限制，柱子很矮时半径超过半高 roundRect 会抛错。
 */
export function drawSpectrumBars(canvas: HTMLCanvasElement, bars: number[], options: DrawOptions): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.width;
  const height = options.height;

  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const barCount = bars.length;
  if (!barCount) return;

  const minBarHeight = options.minBarHeight ?? 2;
  const slot = width / barCount;
  const barWidth = slot * 0.8;
  const radius = Math.min(2, barWidth / 2);

  ctx.fillStyle = options.color;

  for (let i = 0; i < barCount; i++) {
    const barHeight = Math.max(bars[i] * height, minBarHeight);
    const x = i * slot;
    const y = height - barHeight;

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, barWidth, barHeight, Math.min(radius, barHeight / 2));
    else ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fill();
  }
}
