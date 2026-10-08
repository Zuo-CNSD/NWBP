import { memo, useState } from "react";

import { Slider } from "@heroui/react";
import { twMerge } from "tailwind-merge";

import { formatDuration } from "@/common/utils/time";
import { usePlayList } from "@/store/play-list";
import { usePlayProgress } from "@/store/play-progress";

interface Props {
  isDisabled?: boolean;
  className?: string;
  trackClassName?: string;
}

const MusicPlayProgress = memo(({ isDisabled, className, trackClassName }: Props) => {
  const [hovered, setHovered] = useState(false);
  const currentTime = usePlayProgress(s => s.currentTime);
  const duration = usePlayList(s => s.duration);
  const seek = usePlayList(s => s.seek);

  const showThumb = !isDisabled && hovered;
  // duration 未知时（元数据还没加载完）不能把 undefined 交给 Slider，
  // 否则 HeroUI 会回落到默认的 maxValue=100，进度比例会算错
  const maxDuration = duration && Number.isFinite(duration) && duration > 0 ? duration : 100;

  return (
    <div className={twMerge("flex w-3/4 items-center space-x-2", className)}>
      <div className="flex justify-center text-sm whitespace-nowrap opacity-70">
        {currentTime ? formatDuration(currentTime) : "-:--"}
      </div>
      <Slider
        aria-label="播放进度"
        hideThumb={!showThumb}
        minValue={0}
        maxValue={maxDuration}
        value={Math.min(currentTime, maxDuration)}
        onChange={v => seek(v as number)}
        isDisabled={isDisabled}
        size="sm"
        color={showThumb ? "primary" : "foreground"}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex-1"
        classNames={{
          track: twMerge("h-[4px] cursor-pointer rounded-full", trackClassName),
          thumb: "w-4 h-4 bg-primary after:hidden",
        }}
      />
      <span className="flex justify-center text-sm whitespace-nowrap opacity-70">
        {duration ? formatDuration(duration) : "-:--"}
      </span>
    </div>
  );
});

export default MusicPlayProgress;
