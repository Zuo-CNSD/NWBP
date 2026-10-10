import React, { useCallback } from "react";

import type { ContextMenuItem } from "@/components/context-menu";

import MusicCard from "@/components/music-card";
import VirtualGridPageList from "@/components/virtual-grid-page-list";

/** 歌单和专辑在列表里长得一样，用同一份数据结构喂给卡片的 */
export interface NeteaseCollectionItem {
  id: number;
  name: string;
  cover: string;
  /** 副标题：歌单是创建者，专辑是歌手 */
  subtitle?: string;
  /** 曲目数 */
  trackCount?: number;
}

interface Props {
  items: NeteaseCollectionItem[];
  getScrollElement: () => HTMLElement | null;
  onPress: (item: NeteaseCollectionItem) => void;
  hasMore?: boolean;
  loading?: boolean;
  onLoadMore?: () => void;
  /** 「在网易云打开」拼链接用 */
  urlOf: (id: number) => string;
}

/**
 * 歌单 / 专辑的卡片网格。
 *
 * 直接复用 `MusicCard` + `VirtualGridPageList`，和 B 站那边的收藏夹列表同一套 ——
 * 只有右键菜单不同（网易云这边没有收藏/下载那些动作）。
 */
const NeteaseCollectionList = ({
  items,
  getScrollElement,
  onPress,
  hasMore = false,
  loading = false,
  onLoadMore,
  urlOf,
}: Props) => {
  const renderItem = useCallback(
    (item: NeteaseCollectionItem) => {
      const menus: ContextMenuItem[] = [{ key: "netease-link", label: "在网易云打开" }];

      return (
        <MusicCard
          key={item.id}
          title={item.name}
          cover={item.cover}
          playCount={item.trackCount}
          ownerName={item.subtitle}
          menus={menus}
          onMenuAction={key => {
            if (key === "netease-link") void window.electron.openExternal(urlOf(item.id));
          }}
          onPress={() => onPress(item)}
        />
      );
    },
    [onPress, urlOf],
  );

  return (
    <VirtualGridPageList
      items={items}
      hasMore={hasMore}
      loading={loading}
      itemKey="id"
      renderItem={renderItem}
      getScrollElement={getScrollElement}
      onLoadMore={onLoadMore ?? (() => void 0)}
    />
  );
};

export default NeteaseCollectionList;
