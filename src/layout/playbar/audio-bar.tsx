import { useEffect, useRef } from "react";

import { drawSpectrumBars, readSpectrumBars } from "@/common/utils/spectrum";
import { audio as audioElement } from "@/store/play-list";

/**
 * 播放栏上方的动态音频条。
 *
 * 采集与绘制和「全屏播放器的频谱」「桌面歌词的频谱」共用同一套
 * （`common/utils/spectrum.ts`）；区别只在这里**直接读本窗口的 analyser** ——
 * 主窗口本来就是音频所在的进程，不需要跨窗广播那一套。
 *
 * 三个细节：
 *
 * 1. **暂停时喂 0，让它平滑落回底线**，而不是僵在半空。
 *    播放栏一直在眼前，僵住很像卡死；全屏播放器那种"停在最后一帧"在那边合理，这边不合适。
 *    落到底之后就停掉重绘，不白烧帧。
 * 2. **柱子数按宽度算**（约 8px 一根）。播放栏很宽，固定 48 根会又粗又空。
 * 3. **颜色从 `--heroui-primary` 现读**：canvas 不认 CSS 变量，
 *    只能读出来再拼成 `hsl(...)`；每 500ms 重读一次，换主色/换主题也能跟上。
 */
const BAR_HEIGHT = 26;
const PX_PER_BAR = 8;
const MIN_BARS = 24;
const MAX_BARS = 160;

/** 落到底线（低于这个值就不再重绘） */
const IDLE_THRESHOLD = 0.005;

const PlayBarAudioBar = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rafId = 0;
    let bars: number[] = [];
    let color = "#1ed760";
    let colorCheckedAt = 0;
    /** 已经画过「落到底」的那一帧没有 —— 画过一次就不用再重绘了 */
    let paintedFlat = false;

    const resolveColor = () => {
      try {
        const channels = getComputedStyle(document.documentElement).getPropertyValue("--heroui-primary").trim();
        if (channels) color = `hsl(${channels})`;
      } catch {
        // 读不到就沿用上一次的颜色，别让整条掉线
      }
    };

    const render = (now: number) => {
      rafId = requestAnimationFrame(render);

      const width = canvas.clientWidth;
      if (!width) return;

      const barCount = Math.min(MAX_BARS, Math.max(MIN_BARS, Math.round(width / PX_PER_BAR)));
      if (bars.length !== barCount) bars = new Array<number>(barCount).fill(0);

      const playing = !audioElement.paused;

      /*
       * 暂停且已经落到最低：补画最后一次就停。
       *
       * 这一次「补画」不能省 —— 否则从没播过时第一帧就直接 return，
       * canvas 的缓冲区永远停在默认的 300×150（没被 drawSpectrumBars 重设过），
       * 拉宽到 100% 后画面是花的。
       */
      if (!playing && Math.max(...bars) < IDLE_THRESHOLD) {
        if (!paintedFlat) {
          paintedFlat = true;
          drawSpectrumBars(canvas, bars, { height: BAR_HEIGHT, color, minBarHeight: 1 });
        }
        return;
      }
      paintedFlat = false;

      if (now - colorCheckedAt > 500) {
        colorCheckedAt = now;
        resolveColor();
      }

      if (playing) {
        const target = readSpectrumBars(barCount);
        // 往目标插值一下，30fps 的采样看着才连续
        for (let i = 0; i < barCount; i++) bars[i] += (target[i] - bars[i]) * 0.45;
      } else {
        for (let i = 0; i < barCount; i++) bars[i] *= 0.82;
      }

      drawSpectrumBars(canvas, bars, { height: BAR_HEIGHT, color, minBarHeight: 1 });
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none block w-full"
      // 亮背景（自定义背景图/壁纸）上要能看清，加一层很轻的暗投影
      style={{ height: BAR_HEIGHT, filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.35))" }}
    />
  );
};

export default PlayBarAudioBar;
