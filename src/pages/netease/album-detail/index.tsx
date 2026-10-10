import React, { useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router";

import { Button } from "@heroui/react";
import { RiArrowLeftLine } from "@remixicon/react";

import NeteasePageStatus from "@/components/netease/page-status";
import NeteaseTrackList from "@/components/netease/track-list";
import { useNeteaseLoad } from "@/components/netease/use-netease-load";
import ScrollContainer, { type ScrollRefObject } from "@/components/scroll-container";

interface Loaded {
  name: string;
  artist: string;
  tracks: NeteaseTrack[];
}

const EMPTY: Loaded = { name: "", artist: "", tracks: [] };

/** 网易云专辑详情（从「我的专辑」点进来） */
const NeteaseAlbumDetail = () => {
  const scrollerRef = useRef<ScrollRefObject>(null);
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const albumId = Number(id);

  const load = useCallback(async (): Promise<Loaded> => {
    if (!albumId) return EMPTY;
    const detail = await window.electron.netease.albumDetail(albumId);
    return {
      name: detail?.name ?? "",
      artist: detail?.artist ?? "",
      tracks: detail?.tracks ?? [],
    };
  }, [albumId]);

  const { data, loading, error, reload } = useNeteaseLoad<Loaded>(load, EMPTY);

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
        <h1>{data.name || "专辑"}</h1>
        {data.artist && <div className="text-default-500 mt-1 text-sm">{data.artist}</div>}
        <div className="mb-2" />
      </div>

      <NeteasePageStatus
        loading={loading}
        error={error}
        empty={!loading && !error && data.tracks.length === 0}
        emptyText="这张专辑里没有可显示的曲目"
        onRetry={reload}
      />

      {!loading && !error && data.tracks.length > 0 && (
        <NeteaseTrackList
          tracks={data.tracks}
          getScrollElement={() => scrollerRef.current?.osInstance()?.elements().viewport || null}
          summary={`网易云 · 共 ${data.tracks.length} 首`}
        />
      )}
    </ScrollContainer>
  );
};

export default NeteaseAlbumDetail;
