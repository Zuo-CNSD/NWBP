import { useEffect, useRef } from "react";

import { drawSpectrumBars, readSpectrumBars } from "@/common/utils/spectrum";
import { audio as audioElement } from "@/store/play-list";

interface AudioWaveformProps {
  width?: number;
  height?: number;
  barCount?: number;
  barColor?: string;
}

/**
 * 音频波形可视化组件（全屏播放器用）。
 *
 * 采集与绘制都在 `@/common/utils/spectrum`：桌面歌词窗要画的是同一份数据，
 * 只是数据来自主窗口的广播而不是本地 analyser，所以两边必须共用绘制实现。
 *
 * 这里只负责「什么时候画」：播放中按帧重绘，暂停就停在最后一帧
 * （和播放器一致 —— 暂停后柱子停在原地，不会突然塌掉）。
 */
const AudioWaveform = ({ width = 56, height = 56, barCount = 40, barColor = "currentColor" }: AudioWaveformProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationIdRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioElement) return;

    const draw = () => {
      drawSpectrumBars(canvas, readSpectrumBars(barCount), {
        height,
        color: barColor === "currentColor" ? "#666" : barColor,
      });
    };

    // 播放就接着画（analyser 的 resume 由 readSpectrumBars 内部处理）
    const handlePlay = () => {
      if (!animationIdRef.current) render();
    };

    const handlePause = () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = 0;
      }
    };

    const render = () => {
      draw();
      animationIdRef.current = requestAnimationFrame(render);
    };

    audioElement.addEventListener("play", handlePlay);
    audioElement.addEventListener("pause", handlePause);

    // Initialize state
    if (!audioElement.paused) {
      render();
    } else {
      draw();
    }

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = 0;
      }
      audioElement.removeEventListener("play", handlePlay);
      audioElement.removeEventListener("pause", handlePause);
    };
  }, [width, height, barCount, barColor]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
};

export default AudioWaveform;
