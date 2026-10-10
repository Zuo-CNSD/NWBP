import React, { useCallback, useRef } from "react";
import { useNavigate } from "react-router";

import NeteaseCollectionList, { type NeteaseCollectionItem } from "@/components/netease/collection-list";
import NeteasePageStatus from "@/components/netease/page-status";
import { useNeteaseLoad } from "@/components/netease/use-netease-load";
import ScrollContainer, { type ScrollRefObject } from "@/components/scroll-container";
import { useNetease } from "@/store/netease";

const toItem = (playlist: NeteasePlaylistInfo): NeteaseCollectionItem => ({
  id: playlist.id,
  name: playlist.name,
  cover: playlist.cover,
  subtitle: playlist.creator,
  trackCount: playlist.trackCount,
});

/** 我的歌单（含「我喜欢的音乐」那个特殊歌单，点进去就是它的详情） */
const NeteasePlaylists = () => {
  const scrollerRef = useRef<ScrollRefObject>(null);
  const navigate = useNavigate();
  // 换账号要重拉，否则会停在上一个账号的歌单上
  const uid = useNetease(state => state.account?.uid ?? null);

  const load = useCallback(async () => {
    const lists = await window.electron.netease.myPlaylists();
    return (lists ?? []).map(toItem);
  }, []);

  const { data, loading, error, reload } = useNeteaseLoad<NeteaseCollectionItem[]>(load, [], uid);

  return (
    <ScrollContainer enableBackToTop ref={scrollerRef} className="h-full w-full">
      <div className="px-4 pt-4">
        <h1>我的歌单</h1>
        <div className="text-default-500 mt-1 mb-2 text-sm">来自网易云账号</div>
      </div>

      <NeteasePageStatus
        loading={loading}
        error={error}
        empty={!loading && !error && data.length === 0}
        emptyText="登录网易云后才能读取你的歌单"
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

export default NeteasePlaylists;
