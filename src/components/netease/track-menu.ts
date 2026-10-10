import type { ContextMenuItem } from "@/components/context-menu";

/**
 * 网易云曲目的右键菜单。
 *
 * 刻意比 B 站那边短：收藏夹、视频下载、B 站链接这些都只对 B 站内容有意义，
 * 网易云这边只有「喜欢（我喜欢的音乐）/ 下一首播放 / 加到播放列表 / 去网页看看」说得通。
 *
 * `liked` 决定第一项是「喜欢」还是「取消喜欢」—— 状态从 `useNeteaseLike` 的集合来。
 */
export const getNeteaseTrackMenus = (liked: boolean): ContextMenuItem[] => [
  { key: liked ? "unlike" : "like", label: liked ? "取消喜欢" : "喜欢" },
  { key: "play-next", label: "下一首播放" },
  { key: "add-to-playlist", label: "添加到播放列表" },
  { key: "netease-link", label: "在网易云打开" },
];

/** 曲目时长：网易云给的是毫秒，播放列表统一用秒 */
export const toSeconds = (ms: number) => Math.round((ms || 0) / 1000);

/**
 * 把一首网易云曲目转成播放列表能吃的形状。
 *
 * 抽出来是因为搜索页、歌单详情、专辑详情、我喜欢的音乐四处都要用，
 * 各写一遍迟早会出现某一处漏了 `duration` 或 `source` 的情况。
 */
export const toNeteasePlayItem = (track: NeteaseTrack) => ({
  type: "audio" as const,
  source: "netease" as const,
  neteaseId: track.id,
  title: track.name,
  cover: track.cover,
  ownerName: track.artists,
  duration: toSeconds(track.duration),
});

export const neteaseSongUrl = (id: number) => `https://music.163.com/#/song?id=${id}`;
