import { useEffect, useRef } from "react";

import { drawSpectrumBars, SPECTRUM_BAR_COUNT } from "@/common/utils/spectrum";

interface Props {
  /** 主窗口广播过来的归一化柱高（0–1） */
  bars: number[];
  /** 柱色，跟着歌词文字颜色走 */
  color: string;
  height?: number;
  opacity?: number;
}

/**
 * 桌面歌词上方的频谱条。
 *
 * 数据不是自己采的 —— 桌面歌词窗里没有音频可分析，柱高由主窗口算好广播过来
 * （见 common/utils/desktop-lyrics-channel）。这里只负责画。
 *
 * 唯一多做的一件事是**插值**：广播是 30fps 的，直接画会一跳一跳；
 * 用 rAF 让柱子按每帧 35% 的速度追目标值，看起来就是连续的。
 * 这也让暂停时那一帧全 0 变成「自然落回」而不是「啪一下塌掉」。
 */
const SMOOTHING = 0.35;

/** 没有底板时，柱子得靠阴影在深浅桌面上都看得清（和歌词文字同一个思路） */
const BAR_SHADOW = "drop-shadow(0 1px 3px rgba(0, 0, 0, 0.8))";

const DesktopLyricsSpectrum = ({ bars, color, height = 26, opacity = 1 }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<number[]>(new Array<number>(SPECTRUM_BAR_COUNT).fill(0));
  const currentRef = useRef<number[]>(new Array<number>(SPECTRUM_BAR_COUNT).fill(0));

  // 广播来的空数组 = 没有频谱数据（比如刚开窗还没收到），按全 0 处理 → 画基准线
  useEffect(() => {
    targetRef.current = bars.length ? bars : new Array<number>(SPECTRUM_BAR_COUNT).fill(0);
  }, [bars]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rafId = 0;

    const render = () => {
      rafId = requestAnimationFrame(render);

      const target = targetRef.current;
      if (currentRef.current.length !== target.length) {
        currentRef.current = new Array<number>(target.length).fill(0);
      }

      const current = currentRef.current;
      for (let i = 0; i < target.length; i++) {
        current[i] += (target[i] - current[i]) * SMOOTHING;
      }

      drawSpectrumBars(canvas, current, { height, color });
    };

    render();
    return () => cancelAnimationFrame(rafId);
  }, [height, color]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none flex-none"
      style={{ width: "100%", maxWidth: 560, height, opacity, filter: BAR_SHADOW }}
    />
  );
};

export default DesktopLyricsSpectrum;
