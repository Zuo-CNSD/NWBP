import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { PlayData, PlayItem } from "./play-list";

/** 最多留多少条 —— 超过就丢最老的 */
const MAX_ITEMS = 300;

/**
 * 一条本地播放记录。
 *
 * 只存「重播这一条要用的字段」，**不存 audioUrl**：除了本地文件，
 * 其它来源的播放地址都是带签名的短效链接，存下来过一会儿就是死链。
 */
export interface PlayHistoryItem {
  /** 唯一身份，用来去重。由 `historyKey()` 算出来 */
  key: string;
  title: string;
  type: PlayData["type"];
  source?: PlayData["source"];
  /** B 站视频 bvid */
  bvid?: string;
  /** B 站音频 sid */
  sid?: number;
  /** 网易云歌曲 id */
  neteaseId?: number;
  /** 本地文件的绝对路径（`source === "local"`），也是它在列表里的 id */
  localPath?: string;
  cover?: string;
  ownerName?: string;
  ownerMid?: number;
  /** 秒 */
  duration?: number;
  /** 最近一次播放的时间戳（毫秒） */
  playedAt: number;
}

/**
 * 给一首歌算一个稳定的 key。
 *
 * ⚠️ **必须按来源加前缀**：B 站的 sid 和网易云的 id 都是纯数字，不加前缀必撞
 * （歌词缓存键踩过同一个坑）。
 *
 * ⚠️ 视频按 **bvid** 去重而不是 bvid+cid：分集是同一个视频的不同片段，
 * 「最近播放」里出现 12 条同一个番剧的分集没意义。
 */
export const historyKey = (item: PlayData): string | null => {
  if (item.source === "local") return item.id ? `local:${item.id}` : null;
  if (item.source === "netease") return item.neteaseId ? `netease:${item.neteaseId}` : null;
  if (item.type === "mv") return item.bvid ? `bili:mv:${item.bvid}` : null;
  if (item.type === "audio") return item.sid ? `bili:audio:${item.sid}` : null;
  return null;
};

const toHistoryItem = (item: PlayData, key: string): PlayHistoryItem => ({
  key,
  title: item.title,
  type: item.type,
  source: item.source,
  bvid: item.bvid,
  sid: item.sid,
  neteaseId: item.neteaseId,
  localPath: item.source === "local" ? item.id : undefined,
  cover: item.cover,
  ownerName: item.ownerName,
  ownerMid: item.ownerMid,
  duration: item.duration,
  playedAt: Date.now(),
});

/**
 * 播放记录 → 播放列表能吃的形状。
 *
 * 分集的 `cid` 没有存（见上面去重策略），所以从历史点进来放的是**第一集** ——
 * 播放器现有的 `play()` 也只支持给 bvid 让它自己去取分集列表。
 */
export const toPlayItem = (item: PlayHistoryItem): PlayItem | null => {
  if (item.source === "local") {
    if (!item.localPath) return null;
    return { type: "audio", source: "local", id: item.localPath, audioUrl: item.localPath, title: item.title };
  }

  if (item.source === "netease") {
    if (!item.neteaseId) return null;
    return {
      type: "audio",
      source: "netease",
      neteaseId: item.neteaseId,
      title: item.title,
      cover: item.cover,
      ownerName: item.ownerName,
      duration: item.duration,
    };
  }

  if (item.type === "mv") {
    if (!item.bvid) return null;
    return {
      type: "mv",
      bvid: item.bvid,
      title: item.title,
      cover: item.cover,
      ownerName: item.ownerName,
      ownerMid: item.ownerMid,
      duration: item.duration,
    };
  }

  if (!item.sid) return null;
  return {
    type: "audio",
    sid: item.sid,
    title: item.title,
    cover: item.cover,
    ownerName: item.ownerName,
    ownerMid: item.ownerMid,
    duration: item.duration,
  };
};

interface State {
  items: PlayHistoryItem[];
}

interface Action {
  /** 记一次播放。歌没变（暂停后继续）时只是把它挪到最前面 */
  record: (item: PlayData) => void;
  remove: (key: string) => void;
  clear: () => void;
}

/**
 * 本地播放历史。
 *
 * 为什么要有它：主页那个「最近播放」原来读的是 **B 站站内观看历史**
 * （`searchWebInterfaceHistory`），也就是你在 B 站网页上看过什么 ——
 * 播放器里播的歌、网易云的歌、本地文件，一条都不会进去，
 * 更别说 `shouldReportPlayRecord()` 还明确把网易云排除在 B 站上报之外。
 * 所以只能自己记一份。
 *
 * 落盘方式和搜索历史一样走 `persist` 默认存储（localStorage）。
 */
export const usePlayHistory = create<State & Action>()(
  persist(
    (set, get) => ({
      items: [],
      record: item => {
        const key = historyKey(item);
        if (!key) return;

        const next = toHistoryItem(item, key);
        set({
          items: [next, ...get().items.filter(exist => exist.key !== key)].slice(0, MAX_ITEMS),
        });
      },
      remove: key => set({ items: get().items.filter(item => item.key !== key) }),
      clear: () => set({ items: [] }),
    }),
    {
      name: "play-history",
      partialize: state => ({ items: state.items }),
    },
  ),
);
