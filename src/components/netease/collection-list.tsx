import React, { useCallback } from "react";

import { RiMusic2Line } from "@remixicon/react";

import type { ContextMenuItem } from "@/components/context-menu";

import { t } from "@/common/i18n";
import ContextMenu from "@/components/context-menu";
import Image from "@/components/image";
import MusicCard from "@/components/music-card";
import VirtualGridPageList from "@/components/virtual-grid-page-list";
import VirtualPageList from "@/components/virtual-page-list";
import { useSettings } from "@/store/settings";

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
  const displayMode = useSettings(state => state.displayMode);
  const isCompact = displayMode === "compact";
  const onMenuAction = useCallback(
    (key: string, item: NeteaseCollectionItem) => {
      if (key === "netease-link") void window.electron.openExternal(urlOf(item.id));
    },
    [urlOf],
  );
  const renderItem = useCallback(
    (item: NeteaseCollectionItem) => {
      const menus: ContextMenuItem[] = [{ key: "netease-link", label: t("在网易云打开") }];

      return (
        <MusicCard
          key={item.id}
          title={item.name}
          cover={item.cover}
          playCount={item.trackCount}
          ownerName={item.subtitle}
          menus={menus}
          onMenuAction={key => onMenuAction(key, item)}
          onPress={() => onPress(item)}
        />
      );
    },
    [onPress, onMenuAction],
  );

  if (displayMode !== "card") {
    return (
      <VirtualPageList
        items={items}
        hasMore={hasMore}
        loading={loading}
        onLoadMore={onLoadMore ?? (() => void 0)}
        getScrollElement={getScrollElement}
        rowHeight={isCompact ? 48 : 72}
        renderItem={item => (
          <ContextMenu
            key={item.id}
            items={[{ key: "netease-link", label: t("在网易云打开") }]}
            onAction={key => onMenuAction(key, item)}
          >
            <button
              type="button"
              className={`netease-collection-row flex w-full items-center gap-3 rounded-xl text-left ${isCompact ? "h-11 px-2" : "h-16 px-3"}`}
              onClick={() => onPress(item)}
            >
              <Image
                radius="md"
                src={item.cover}
                width={isCompact ? 36 : 52}
                height={isCompact ? 36 : 52}
                emptyPlaceholder={<RiMusic2Line size={20} />}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{item.name}</span>
                {!isCompact && <span className="text-foreground-500 truncate text-sm">{item.subtitle}</span>}
              </span>
              {typeof item.trackCount === "number" && (
                <span className="text-foreground-500 shrink-0 text-xs tabular-nums">{item.trackCount}</span>
              )}
            </button>
          </ContextMenu>
        )}
      />
    );
  }

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
