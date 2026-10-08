import { useEffect, useRef, useState } from "react";

/**
 * 歌词渲染的公共逻辑：找当前行、逐字填充、时间插值。
 *
 * 目前**只有全屏播放器的歌词在用逐字填充**（`components/lyrics`）。
 * 桌面歌词窗已经不用了 —— 那个窗口压在壁纸/视频上、文字还带阴影，
 * 未唱到的字掉到 42% 不透明度后就是一片发黑的字，观感很差。
 * 所以 `wordFillStyle` / `useSmoothProgress` 留着给全屏播放器，但别再往桌面歌词接。
 */

/**
 * 计算一行里每个字的填充状态。
 *
 * 正在唱的字用 `background-clip: text` + 线性渐变做「从左往右填」——
 * 这是 Apple Music 那套逐字高亮，比按字整体切透明度平滑得多。
 *
 * ⚠️ 只有背景干净的地方适合用（全屏播放器）。背景杂乱时未唱到的字（42% 不透明度）
 * 会和背景糊在一起，看着像发黑的字。
 */
export const wordFillStyle = (startMs: number, durationMs: number, currentMs: number, color?: string) => {
  const endMs = startMs + Math.max(1, durationMs);

  if (currentMs <= startMs) return { color, opacity: 0.42 } as const;
  if (currentMs >= endMs) return { color, opacity: 1 } as const;

  const progress = ((currentMs - startMs) / (endMs - startMs)) * 100;
  return {
    color: "transparent",
    backgroundImage: `linear-gradient(90deg, ${color ?? "currentColor"} ${progress}%, rgba(255,255,255,0.42) ${progress}%)`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
  } as const;
};

/**
 * 逐字高亮需要比 `audio.ontimeupdate` 更细的粒度。
 * 那个事件大约每 250ms 才来一次，直接用它驱动会「一格一格跳」，
 * 所以用「上次上报时间 + 真实流逝时间」插值，只在需要时才跑 rAF。
 */
export const useSmoothProgress = (baseMs: number, enabled: boolean) => {
  const [smoothMs, setSmoothMs] = useState(baseMs);
  const anchorRef = useRef({ baseMs, at: performance.now() });

  useEffect(() => {
    anchorRef.current = { baseMs, at: performance.now() };
    setSmoothMs(baseMs);
  }, [baseMs]);

  useEffect(() => {
    if (!enabled) return;

    let raf = 0;
    const tick = () => {
      const anchor = anchorRef.current;
      setSmoothMs(anchor.baseMs + (performance.now() - anchor.at));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [enabled, baseMs]);

  return smoothMs;
};

/** 找当前时间对应到第几行 */
export const findActiveLineIndex = (lines: LyricSyncedLine[], currentMs: number) => {
  if (!lines.length) return -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (currentMs >= lines[i].timeMs) return i;
  }
  return 0;
};

/** 辅助窗口（迷你播放器 / 桌面歌词）不参与主窗口的歌词解析广播 */
export const isAuxiliaryWindow = () => /mini-player|desktop-lyrics/.test(window.location.hash);
