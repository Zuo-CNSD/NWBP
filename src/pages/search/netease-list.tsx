import React, { useCallback, useEffect, useState } from "react";

import { addToast, Spinner } from "@heroui/react";

import Empty from "@/components/empty";
import NeteaseTrackList from "@/components/netease/track-list";

interface Props {
  keyword: string;
  getScrollElement: () => HTMLElement | null;
}

const PAGE_SIZE = 30;

/**
 * 网易云音源下的搜索结果列表。
 *
 * 和 B 站那边的 `video-list` 是两个组件而不是一个：两边能拿到的东西对不上
 * （网易云没有 aid/bvid、没有收藏夹、没有投稿时间），硬塞进一个组件会到处是
 * `source === "netease" ? ... : ...` 的分支。
 * 复用点放在下层：行的画法与右键菜单走 `components/netease/track-list`。
 */
export default function SearchNetease({ keyword, getScrollElement }: Props) {
  const [list, setList] = useState<NeteaseTrack[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const searchApi = window.electron?.netease?.search?.tracks;

  const fetchPage = useCallback(
    async (nextOffset: number) => {
      if (!searchApi) return { tracks: [] as NeteaseTrack[], total: 0 };
      const res = await searchApi(keyword, PAGE_SIZE, nextOffset);
      return { tracks: res?.tracks ?? [], total: res?.total ?? 0 };
    },
    [keyword, searchApi],
  );

  const loadInitial = useCallback(async () => {
    if (!keyword) return;
    setInitialLoading(true);
    setList([]);
    setOffset(0);
    setHasMore(true);
    try {
      const { tracks, total: count } = await fetchPage(0);
      setList(tracks);
      setTotal(count);
      setHasMore(tracks.length < count);
    } catch {
      addToast({ title: "网易云搜索失败，检查一下网络或代理", color: "danger" });
    } finally {
      setInitialLoading(false);
    }
  }, [fetchPage, keyword]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || initialLoading) return;
    try {
      setLoadingMore(true);
      const nextOffset = offset + PAGE_SIZE;
      const { tracks, total: count } = await fetchPage(nextOffset);
      setList(prev => {
        const merged = [...prev, ...tracks];
        setHasMore(merged.length < count);
        return merged;
      });
      setOffset(nextOffset);
    } catch {
      addToast({ title: "加载更多失败", color: "danger" });
    } finally {
      setLoadingMore(false);
    }
  }, [offset, loadingMore, hasMore, initialLoading, fetchPage]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  return (
    <div className="w-full">
      <NeteaseTrackList
        tracks={list}
        getScrollElement={getScrollElement}
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={loadMore}
        summary={initialLoading ? "正在搜索网易云…" : total > 0 ? `网易云 · 共 ${total} 首` : "网易云"}
      />

      {initialLoading && (
        <div className="flex min-h-[200px] items-center justify-center">
          <Spinner label="加载中" />
        </div>
      )}

      {!initialLoading && list.length === 0 && <Empty className="min-h-[280px]" />}
    </div>
  );
}
