import React, { useCallback, useRef } from "react";
import { useNavigate } from "react-router";

import NeteaseCollectionList, { type NeteaseCollectionItem } from "@/components/netease/collection-list";
import NeteasePageStatus from "@/components/netease/page-status";
import { useNeteaseLoad } from "@/components/netease/use-netease-load";
import ScrollContainer, { type ScrollRefObject } from "@/components/scroll-container";
import { useNetease } from "@/store/netease";

/** 我的专辑（收藏的专辑） */
const NeteaseAlbums = () => {
  const scrollerRef = useRef<ScrollRefObject>(null);
  const navigate = useNavigate();
  // 换账号要重拉
  const uid = useNetease(state => state.account?.uid ?? null);

  const load = useCallback(async () => {
    const albums = await window.electron.netease.myAlbums();
    return (albums ?? []).map(
      (album): NeteaseCollectionItem => ({
        id: album.id,
        name: album.name,
        cover: album.cover,
        subtitle: album.artist,
        trackCount: album.trackCount,
      }),
    );
  }, []);

  const { data, loading, error, reload } = useNeteaseLoad<NeteaseCollectionItem[]>(load, [], uid);

  return (
    <ScrollContainer enableBackToTop ref={scrollerRef} className="h-full w-full">
      <div className="px-4 pt-4">
        <h1>我的专辑</h1>
        <div className="text-default-500 mt-1 mb-2 text-sm">来自网易云账号</div>
      </div>

      <NeteasePageStatus
        loading={loading}
        error={error}
        empty={!loading && !error && data.length === 0}
        emptyText="登录网易云后才能读取你收藏的专辑"
        onRetry={reload}
      />

      {!loading && !error && data.length > 0 && (
        <NeteaseCollectionList
          items={data}
          getScrollElement={() => scrollerRef.current?.osInstance()?.elements().viewport || null}
          onPress={item => void navigate(`/netease/album/${item.id}`)}
          urlOf={id => `https://music.163.com/#/album?id=${id}`}
        />
      )}
    </ScrollContainer>
  );
};

export default NeteaseAlbums;
