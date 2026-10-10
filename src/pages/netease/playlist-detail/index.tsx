import React, { useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router";

import { Button } from "@heroui/react";
import { RiArrowLeftLine } from "@remixicon/react";

import NeteasePageStatus from "@/components/netease/page-status";
import NeteaseTrackList from "@/components/netease/track-list";
import { useNeteasePlaylistTracks } from "@/components/netease/use-netease-playlist-tracks";
import ScrollContainer, { type ScrollRefObject } from "@/components/scroll-container";

/** 网易云歌单详情（从「我的歌单」「热门歌单」点进来） */
const NeteasePlaylistDetail = () => {
  const scrollerRef = useRef<ScrollRefObject>(null);
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const playlistId = Number(id);

  // 歌单 id 从路由来；这里只把「非法 id」收敛成 null
  const resolveId = useCallback(
    async () => (Number.isFinite(playlistId) && playlistId > 0 ? playlistId : null),
    [playlistId],
  );

  // 曲目是分页的：首屏 100 首，滚到底再往下要（千首歌单就靠这个）
  const { name, trackCount, tracks, loading, loadingMore, hasMore, error, found, reload, loadMore } =
    useNeteasePlaylistTracks(resolveId);

  return (
    <ScrollContainer enableBackToTop ref={scrollerRef} className="h-full w-full">
      <div className="px-4 pt-4">
        <Button
          size="sm"
          variant="light"
          radius="md"
          className="mb-2 -ml-2"
          startContent={<RiArrowLeftLine size={16} />}
          onPress={() => void navigate(-1)}
        >
          返回
        </Button>
        <h1>{name || "歌单"}</h1>
        {trackCount > 0 && (
          <div className="text-default-500 mt-1 text-sm">
            共 {trackCount} 首{tracks.length < trackCount ? ` · 已加载 ${tracks.length} 首` : ""}
          </div>
        )}
        <div className="mb-2" />
      </div>

      <NeteasePageStatus
        loading={loading}
        error={error}
        empty={!loading && !error && tracks.length === 0}
        emptyText={found ? "这个歌单里没有可显示的曲目" : "歌单不存在或已失效"}
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

export default NeteasePlaylistDetail;
