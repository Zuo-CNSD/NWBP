import React, { useRef, useState, useEffect, useCallback } from "react";

import { Tooltip, Slider } from "@heroui/react";
import { RiVolumeDownLine, RiVolumeMuteLine, RiVolumeUpLine } from "@remixicon/react";

import { usePlayList } from "@/store/play-list";

import IconButton from "../icon-button";

/** 把音量收敛到 [0, 1] 区间，并过滤掉 NaN */
const clampVolume = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const Volume = () => {
  const volume = usePlayList(s => s.volume);
  const isMuted = usePlayList(s => s.isMuted);
  const toggleMute = usePlayList(s => s.toggleMute);
  const setVolume = usePlayList(s => s.setVolume);

  const previousVolume = useRef(volume > 0 ? volume : 0.5);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);

  const setSliderRef = useCallback((node: HTMLDivElement | null) => {
    if (sliderRef.current) {
      sliderRef.current.removeEventListener("wheel", onWheel);
    }
    sliderRef.current = node;
    if (node) {
      node.addEventListener("wheel", onWheel, { passive: false });
    }
  }, []);

  const onVolumeChange = (val: number) => {
    const next = clampVolume(val);

    // 任何非零音量都记下来，作为下次取消静音时的恢复值
    if (next > 0) {
      previousVolume.current = next;
    }

    setVolume(next);

    // 只在静音状态与音量不匹配时切换一次，避免 0 音量时重复 toggleMute
    const shouldBeMuted = next === 0;
    if (shouldBeMuted !== isMuted) {
      toggleMute();
    }
    if (shouldBeMuted) {
      setIsTooltipOpen(false);
    }
  };

  const onToggleMute = () => {
    if (isMuted) {
      // 恢复到静音前的音量（没有记录时给一个安全默认值）
      setVolume(previousVolume.current > 0 ? previousVolume.current : 0.5);
    } else {
      if (volume > 0) {
        previousVolume.current = volume;
      }
      setVolume(0);
      // 静音时关闭音量条
      setIsTooltipOpen(false);
    }
    toggleMute();
  };

  const onWheel = useCallback((event: WheelEvent) => {
    event.preventDefault(); // 阻止默认滚动行为

    const state = usePlayList.getState();
    const { volume, isMuted, toggleMute, setVolume } = state;

    // 显示音量条
    setIsTooltipOpen(true);

    // 清除之前的定时器
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
    }

    // 设置3秒后自动隐藏音量条
    tooltipTimerRef.current = setTimeout(() => {
      setIsTooltipOpen(false);
    }, 3000);

    // 静音状态下从静音前的音量继续调整，避免从 0 开始只能一点点加
    const baseVolume = isMuted ? previousVolume.current : volume;

    // 计算音量变化量，根据滚轮方向调整
    const delta = event.deltaY > 0 ? -0.05 : 0.05;
    const newVolume = clampVolume(baseVolume + delta);

    if (newVolume > 0) {
      previousVolume.current = newVolume;
    }

    // 更新音量
    setVolume(newVolume);

    // 音量与静音状态保持一致：变为 0 时静音、从 0 恢复时取消静音
    const shouldBeMuted = newVolume === 0;
    if (shouldBeMuted !== isMuted) {
      toggleMute();
    }
    if (shouldBeMuted) {
      setIsTooltipOpen(false);
    }
  }, []);

  // 清理定时器
  useEffect(() => {
    const button = buttonRef.current;
    if (button) {
      button.addEventListener("wheel", onWheel, { passive: false });
    }

    return () => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
      if (button) {
        button.removeEventListener("wheel", onWheel);
      }
    };
  }, [onWheel]);

  const tooltipId = "volume-tooltip";

  return (
    <Tooltip
      disableAnimation
      id={tooltipId}
      placement="top"
      delay={300}
      showArrow={false}
      triggerScaleOnOpen={false}
      shouldCloseOnBlur={false}
      isOpen={isTooltipOpen}
      onOpenChange={setIsTooltipOpen}
      content={
        <div ref={setSliderRef} className="flex items-center justify-center p-3">
          <Slider
            disableAnimation
            aria-label="音量"
            color="primary"
            radius="full"
            size="sm"
            orientation="vertical"
            value={volume}
            minValue={0}
            maxValue={1}
            step={0.01}
            // @ts-expect-error volume is number
            onChange={onVolumeChange}
            classNames={{
              trackWrapper: "h-40 w-[32px]",
              thumb: "after:hidden",
            }}
            endContent={
              <span className="text-foreground/60 w-8 text-center text-xs tabular-nums">
                {Math.round(volume * 100)}%
              </span>
            }
          />
        </div>
      }
    >
      <IconButton
        ref={buttonRef}
        onPress={onToggleMute}
        aria-label={isMuted ? "取消静音" : "静音"}
        aria-describedby={tooltipId}
      >
        {isMuted ? (
          <RiVolumeMuteLine size={18} />
        ) : volume > 0.5 ? (
          <RiVolumeUpLine size={18} />
        ) : (
          <RiVolumeDownLine size={18} />
        )}
      </IconButton>
    </Tooltip>
  );
};

export default Volume;
