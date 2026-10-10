import React, { useCallback, useEffect } from "react";

import { addToast, Button } from "@heroui/react";
import { RiPlayFill } from "@remixicon/react";

import { favoriteTrack } from "@/common/utils/favorite";
import { formatUrlProtocol } from "@/common/utils/url";
import MusicListItem from "@/components/music-list-item";
import MusicListHeader from "@/components/music-list-item/header";
import VirtualPageList from "@/components/virtual-page-list";
import { useNeteaseLike } from "@/store/netease-like";
import { usePlayList } from "@/store/play-list";
import { useSettings } from "@/store/settings";

import { getNeteaseTrackMenus, neteaseSongUrl, toNeteasePlayItem, toSeconds } from "./track-menu";

interface Props {
  tracks: NeteaseTrack[];
  getScrollElement: () => HTMLElement | null;
  /** 还有下一页 */
  hasMore?: boolean;
  /** **加载下一页**中（不是首屏加载 —— 首屏那块走 `NeteasePageStatus`），会挡住补屏重复触发 */
  loading?: boolean;
  onLoadMore?: () => void;
  /** 左上的说明文字，例如「网易云 · 共 30 首」 */
  summary?: React.ReactNode;
  /** 右上按钮，默认是「播放全部」 */
  toolbar?: React.ReactNode;
  /** 右上是否显示「播放全部」 */
  showPlayAll?: boolean;
  className?: string;
}

/**
 * 网易云曲目列表。
 *
 * 搜索页、歌单详情、专辑详情、我喜欢的音乐四处共用 —— 它们只有「数据从哪来」不同，
 * 行怎么画、点了怎么播、右键有哪些项是一样的。
 */
const NeteaseTrackList = ({
  tracks,
  getScrollElement,
  hasMore = false,
  loading = false,
  onLoadMore,
  summary,
  toolbar,
  showPlayAll = true,
  className,
}: Props) => {
  const displayMode = useSettings(state => state.displayMode);
  const isCompact = displayMode === "compact";

  // 订阅「我喜欢的音乐」集合：收藏后右键菜单里的「喜欢 / 取消喜欢」要跟着变
  const likedIds = useNeteaseLike(state => state.ids);
  const refreshLiked = useNeteaseLike(state => state.refresh);

  useEffect(() => {
    void refreshLiked();
  }, [refreshLiked]);

  const handlePress = useCallback((track: NeteaseTrack) => {
    void usePlayList.getState().play(toNeteasePlayItem(track));
  }, []);

  const handlePlayAll = useCallback(() => {
    if (!tracks.length) return;
    usePlayList.getState().addList(tracks.map(toNeteasePlayItem));
    addToast({ title: `已添加 ${tracks.length} 首到播放列表`, color: "success" });
  }, [tracks]);

  const handleMenuAction = useCallback((key: string, track: NeteaseTrack) => {
    switch (key) {
      case "like":
      case "unlike":
        void favoriteTrack(toNeteasePlayItem(track));
        break;
      case "play-next":
        usePlayList.getState().addToNext(toNeteasePlayItem(track));
        addToast({ title: "已添加到下一首播放", color: "success" });
        break;
      case "add-to-playlist":
        usePlayList.getState().addList([toNeteasePlayItem(track)]);
        addToast({ title: "已添加到播放列表", color: "success" });
        break;
      case "netease-link":
        void window.electron.openExternal(neteaseSongUrl(track.id));
        break;
      default:
        break;
    }
  }, []);

  return (
    <div className={className ?? "w-full px-4"}>
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="text-default-500 min-w-0 truncate text-sm">{summary}</span>
        <div className="flex flex-none items-center gap-2">
          {toolbar}
          {showPlayAll && (
            <Button
              size="sm"
              radius="md"
              color="primary"
              variant="flat"
              isDisabled={tracks.length === 0}
              startContent={<RiPlayFill />}
              onPress={handlePlayAll}
            >
              播放全部
            </Button>
          )}
        </div>
      </div>

      {tracks.length > 0 && (
        <>
          {/* 网易云没有「播放量 / 投稿时间」，那一列拿来放专辑名 */}
          <MusicListHeader timeTitle="专辑" />
          <VirtualPageList
            items={tracks}
            hasMore={hasMore}
            loading={loading}
            onLoadMore={onLoadMore ?? (() => void 0)}
            getScrollElement={getScrollElement}
            rowHeight={isCompact ? 36 : 64}
            renderItem={(track, index) => (
              <MusicListItem
                key={track.id}
                menus={getNeteaseTrackMenus(likedIds.has(track.id))}
                index={index + 1}
                title={track.name}
                type="audio"
                neteaseId={track.id}
                cover={formatUrlProtocol(track.cover)}
                upName={track.artists}
                duration={toSeconds(track.duration)}
                pubTime={track.album}
                onPress={() => handlePress(track)}
                onMenuAction={key => handleMenuAction(key, track)}
              />
            )}
          />
        </>
      )}
    </div>
  );
};

export default NeteaseTrackList;
