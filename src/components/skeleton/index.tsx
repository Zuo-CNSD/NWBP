import React from "react";

import { twMerge } from "tailwind-merge";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/**
 * 单个占位灰块，带从左扫到右的高光。
 * 动画写在 `app.css` 的 `.skeleton` 里，开了「减少动态效果」会自动停。
 */
export const Skeleton = ({ className, ...rest }: SkeletonProps) => (
  <div aria-hidden className={twMerge("skeleton rounded-medium", className)} {...rest} />
);

interface ListSkeletonProps {
  /** 占位行数 */
  rows?: number;
  /** 封面边长（px）；传 0 表示纯文字列表，不画封面块 */
  cover?: number;
}

/**
 * 列表首次加载时的整块占位：默认「封面 + 两行文字」的歌曲行。
 *
 * 相比居中转圈的好处：占位高度贴着真实行，数据回来时**不会跳版**；
 * 宽度用下标推出来的固定抖动，不是随机数 —— 否则每次重渲染条长都在变，反而更像故障。
 */
export const ListSkeleton = ({ rows = 8, cover = 40 }: ListSkeletonProps) => (
  <div className="px-3 py-2">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="flex items-center gap-3 py-2">
        {cover > 0 && <Skeleton className="shrink-0" style={{ width: cover, height: cover }} />}
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3" style={{ width: `${52 + ((index * 17) % 34)}%` }} />
          <Skeleton className="h-2.5" style={{ width: `${22 + ((index * 11) % 18)}%` }} />
        </div>
      </div>
    ))}
  </div>
);

export default ListSkeleton;
