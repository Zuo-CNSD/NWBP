import type { ReactNode } from "react";

import { useModalStore } from "@/store/modal";
import { useNeteaseLike } from "@/store/netease-like";

/** 收藏时要看的最小字段集 —— 播放列表项、搜索结果、曲目行都满足 */
export interface FavoriteTrack {
  type: "mv" | "audio";
  source?: "local" | "online" | "netease";
  /** 网易云曲目 id */
  neteaseId?: number;
  /** B 站稿件 id（type === "mv" 时收藏用） */
  aid?: string;
  /** B 站音频 id（type === "audio" 时收藏用） */
  sid?: number;
  /** 曲名，只用于网易云那边的提示文案 */
  title?: string;
}

export const isNeteaseTrack = (track?: { source?: string; neteaseId?: number } | null) =>
  Boolean(track && track.source === "netease" && track.neteaseId);

interface Options {
  /** B 站收藏弹窗的标题（默认「收藏」） */
  modalTitle?: ReactNode;
  /** 收藏状态变化后的回调，参数是「现在是否已收藏」 */
  onChanged?: (isFav: boolean) => void;
}

/**
 * 统一的收藏入口：**曲目来自哪家就收藏到哪家。**
 *
 * - 网易云曲目 → 直接翻转「我喜欢的音乐」（网易云那边没有多收藏夹可选）
 * - B 站曲目   → 打开收藏夹选择弹窗（原有行为）
 *
 * 以前每个入口各写一遍「打开 B 站收藏弹窗」，网易云曲目点收藏会拿一个网易云的 id
 * 去问 B 站的收藏夹 —— 必然失败。所以这里收成一个口子，别在调用方再分叉。
 */
export async function favoriteTrack(track: FavoriteTrack, options?: Options) {
  if (isNeteaseTrack(track)) {
    const liked = await useNeteaseLike.getState().toggle(track.neteaseId as number, track.title);
    options?.onChanged?.(liked);
    return;
  }

  useModalStore.getState().onOpenFavSelectModal({
    rid: track.type === "mv" ? String(track.aid ?? "") : String(track.sid ?? ""),
    type: track.type === "mv" ? 2 : 12,
    title: options?.modalTitle ?? "收藏",
    onSuccess: selectedIds => options?.onChanged?.(Boolean(selectedIds?.length)),
  });
}
