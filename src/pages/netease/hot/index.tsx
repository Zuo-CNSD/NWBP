import React, { useCallback, useRef } from "react";
import { useNavigate } from "react-router";

import NeteaseCollectionList, { type NeteaseCollectionItem } from "@/components/netease/collection-list";
import NeteasePageStatus from "@/components/netease/page-status";
import { useNeteaseLoad } from "@/components/netease/use-netease-load";
import ScrollContainer, { type ScrollRefObject } from "@/components/scroll-container";

const HOT_LIMIT = 50;

/** 热门歌单 —— 不需要登录，所以未登录时这是唯一有内容的网易云页面 */
const NeteaseHot = () => {
  const scrollerRef = useRef<ScrollRefObject>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const lists = await window.electron.netease.hotPlaylists(HOT_LIMIT);
    return (lists ?? []).map(
      (playlist): NeteaseCollectionItem => ({
        id: playlist.id,
        name: playlist.name,
        cover: playlist.cover,
        subtitle: playlist.creator,
        trackCount: playlist.trackCount,
      }),
    );
  }, []);

  const { data, loading, error, reload } = useNeteaseLoad<NeteaseCollectionItem[]>(load, []);

  return (
    <ScrollContainer enableBackToTop ref={scrollerRef} className="h-full w-full">
      <div className="px-4 pt-4">
        <h1>热门歌单</h1>
        <div className="text-default-500 mt-1 mb-2 text-sm">网易云当前的热门歌单，不需要登录</div>
      </div>

      <NeteasePageStatus
        loading={loading}
        error={error}
        empty={!loading && !error && data.length === 0}
        onRetry={reload}
      />

      {!loading && !error && data.length > 0 && (
        <NeteaseCollectionList
          items={data}
          getScrollElement={() => scrollerRef.current?.osInstance()?.elements().viewport || null}
          onPress={item => void navigate(`/netease/playlist/${item.id}`)}
          urlOf={id => `https://music.163.com/#/playlist?id=${id}`}
        />
      )}
    </ScrollContainer>
  );
};

export default NeteaseHot;
