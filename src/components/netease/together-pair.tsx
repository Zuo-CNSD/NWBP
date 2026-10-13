import React from "react";

import { Avatar } from "@heroui/react";
import { twMerge } from "tailwind-merge";

/**
 * 「两个人」——一起听的房间标记。
 *
 * 房间是**当前这首歌**的属性（谁和我一起在听这首），所以它长成一个贴着播放器的标记，
 * 而不是一个需要跳进去的页面。两个重叠头像 + 一条耳机弧线，耳罩落在两人外侧。
 */
interface Props {
  members: NeteaseTogetherUser[];
  /** 头像直径 */
  size?: number;
  className?: string;
}

const TogetherPair = ({ members, size = 28, className }: Props) => {
  const shown = members.slice(0, 2);
  const overlap = size * 0.3;
  const width = size * 2 - overlap;
  const height = size * 1.42;
  const ringWidth = Math.max(1, Math.round(size * 0.07));
  // 头像之间的分隔圈也要跟着尺寸走 —— 固定 border-2 套在 13px 的头像上会糊成一坨
  const avatarRing = Math.max(1, Math.round(size * 0.1));

  return (
    <div className={twMerge("relative flex-none", className)} style={{ width, height }}>
      {/* 耳机弧线：从两人外侧兜一条上去 */}
      <svg
        aria-hidden
        className="text-foreground-300 pointer-events-none absolute inset-0"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
      >
        <path
          d={`M ${ringWidth / 2} ${height - size * 0.5} A ${width / 2 - ringWidth / 2} ${size * 0.62} 0 0 1 ${
            width - ringWidth / 2
          } ${height - size * 0.5}`}
          stroke="currentColor"
          strokeWidth={ringWidth}
          strokeLinecap="round"
        />
      </svg>

      {shown.map((member, index) => (
        <Avatar
          key={member.uid || index}
          src={member.avatarUrl || undefined}
          name={member.nickname || "?"}
          className="border-background absolute bottom-0"
          style={{
            width: size,
            height: size,
            borderWidth: avatarRing,
            left: index === 0 ? 0 : width - size,
            // 先画的压在下面，后画的重叠上来，看着像「靠在一起」
            zIndex: index === 0 ? 1 : 2,
          }}
        />
      ))}
    </div>
  );
};

export default TogetherPair;
