import React, { useCallback, useRef } from "react";

import NeteasePageStatus from "@/components/netease/page-status";
import NeteaseTrackList from "@/components/netease/track-list";
import { useNeteasePlaylistTracks } from "@/components/netease/use-netease-playlist-tracks";
import ScrollContainer, { type ScrollRefObject } from "@/components/scroll-container";
import { useNetease } from "@/store/netease";
import { findOwnLikedPlaylist } from "@shared/netease/playlist";

/**
 * 我喜欢的音乐。
 *
 * 网易云把「我喜欢的音乐」做成一个**特殊歌单**（`specialType === 5`）而不是单独接口，
 * 所以顺序是：先列我的歌单 → 找到那个特殊歌单 → 再分页拉它的曲目。
 *
 * ⚠️ **不能只按 `specialType === 5` 找**：收藏（订阅）别人的「我喜欢的音乐」时，
 * 对方那个歌单同样是 5。实测本账号 96 个歌单里有 3 个是 5（自己的 1001 首 +
 * 收藏来的「白敬同学」(345 首)、「Z1xme」(830 首)），原来 `find` 取第一个，
 * 结果整个页面显示成别人的歌单 —— 标题、曲目、共几首全是别人的。
 * 归属判定统一走 `findOwnLikedPlaylist`（specialType + 非收藏 + creator 是自己）。
 *
 * ⚠️ 换账号必须重拉（`uid` 既进 `resolveId` 依赖也作 `refreshKey`）：**两个账号的
 * 「我喜欢的音乐」是两个不同的歌单 id**，页面组件又不会卸载，不重拉就会一直显示上一个账号的歌。
 */
const NeteaseLiked = () => {
  const scrollerRef = useRef<ScrollRefObject>(null);
  const uid = useNetease(state => state.account?.uid ?? null);

  // uid 进依赖：账号一变重解析（第一次渲染 uid 可能是 null，那时只靠 subscribed 判，够用）
  const resolveId = useCallback(async () => {
    try {
      const lists = await window.electron.netease.myPlaylists();
      return findOwnLikedPlaylist(lists, uid)?.id ?? null;
    } catch {
      // 未登录 / 接口挂了都当作"没有这个歌单"，界面会给出「登录网易云后才能读取…」
      return null;
    }
  }, [uid]);

  // 曲目分页：首屏 100 首，滚到底继续要
  const { name, trackCount, tracks, loading, loadingMore, hasMore, error, found, reload, loadMore } =
    useNeteasePlaylistTracks(resolveId, uid);

  return (
    <ScrollContainer enableBackToTop ref={scrollerRef} className="h-full w-full">
      <div className="px-4 pt-4">
        <h1>{name || "我喜欢的音乐"}</h1>
        <div className="text-default-500 mt-1 mb-2 text-sm">
          来自网易云账号
          {trackCount > 0 ? ` · 共 ${trackCount} 首` : ""}
          {tracks.length < trackCount ? ` · 已加载 ${tracks.length} 首` : ""}
        </div>
      </div>

      <NeteasePageStatus
        loading={loading}
        error={error}
        empty={!loading && !error && tracks.length === 0}
        emptyText={found ? "这个歌单还是空的" : "登录网易云后才能读取「我喜欢的音乐」"}
        onRetry={reload}
      />

      {!loading && !error && tracks.length > 0 && (
        <NeteaseTrackList
          tracks={tracks}
          getScrollElement={() => scrollerRef.current?.osInstance()?.elements().viewport || null}
          hasMore={hasMore}
          loading={loadingMore}
          onLoadMore={() => void loadMore()}
          summary={`网易云 · 共 ${trackCount} 首`}
        />
      )}
    </ScrollContainer>
  );
};

export default NeteaseLiked;
