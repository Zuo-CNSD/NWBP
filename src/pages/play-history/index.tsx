import React, { useCallback, useRef } from "react";
import { useNavigate } from "react-router";

import { Button } from "@heroui/react";
import { RiArrowLeftLine, RiDeleteBinLine } from "@remixicon/react";
import moment from "moment";

import Empty from "@/components/empty";
import Image from "@/components/image";
import ScrollContainer, { type ScrollRefObject } from "@/components/scroll-container";
import VirtualPageList from "@/components/virtual-page-list";
import { useModalStore } from "@/store/modal";
import { type PlayHistoryItem, toPlayItem, usePlayHistory } from "@/store/play-history";
import { usePlayList } from "@/store/play-list";

/** 封面缩略图：只有 B 站的图认这套后缀，别的来源 `Image` 会自己跳过 */
const THUMB_PARAMS = "160w_160h_1c.webp";

/** 给每条记录标个来源 —— 「最近播放」现在 B 站和网易云的歌都会进来，标清楚免得看着像串了 */
const sourceLabel = (item: PlayHistoryItem) => {
  if (item.source === "netease") return "网易云";
  if (item.source === "local") return "本地";
  return "哔哩哔哩";
};

/**
 * 本地播放历史。
 *
 * 数据是 `usePlayHistory`（localStorage），和 B 站那个「历史记录」页是两码事 ——
 * 那个读的是 B 站站内观看历史，只记在 B 站网页上看过什么。
 * 主页「最近播放」的「全部」指向这里。
 */
const PlayHistory = () => {
  const scrollerRef = useRef<ScrollRefObject>(null);
  const navigate = useNavigate();

  const items = usePlayHistory(state => state.items);
  const remove = usePlayHistory(state => state.remove);
  const clear = usePlayHistory(state => state.clear);

  const handlePlay = useCallback((item: PlayHistoryItem) => {
    const playItem = toPlayItem(item);
    if (!playItem) return;
    void usePlayList.getState().play(playItem);
  }, []);

  const handleRemove = useCallback(
    (item: PlayHistoryItem) => {
      void useModalStore.getState().onOpenConfirmModal({
        title: `从播放记录里移除「${item.title}」？`,
        confirmText: "移除",
        type: "danger",
        onConfirm: async () => {
          remove(item.key);
          return true;
        },
      });
    },
    [remove],
  );

  const handleClear = useCallback(() => {
    void useModalStore.getState().onOpenConfirmModal({
      title: "确认清空全部播放记录？",
      description: "只清掉这份本地记录，不影响 B 站的历史记录。",
      confirmText: "清空",
      type: "danger",
      onConfirm: async () => {
        clear();
        return true;
      },
    });
  }, [clear]);

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

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1>最近播放</h1>
            <div className="text-default-500 mt-1 text-sm">
              播放器里播过的歌都在这里，B 站和网易云都会记
              {items.length > 0 ? ` · 共 ${items.length} 条` : ""}
            </div>
          </div>

          {items.length > 0 && (
            <Button size="sm" radius="md" variant="flat" color="danger" onPress={handleClear}>
              清空
            </Button>
          )}
        </div>

        <div className="mb-2" />
      </div>

      {items.length === 0 ? (
        <Empty className="min-h-[280px]" title="还没有播放记录，去搜一首听听" />
      ) : (
        <div className="px-4">
          <VirtualPageList
            items={items}
            loading={false}
            getScrollElement={() => scrollerRef.current?.osInstance()?.elements().viewport || null}
            rowHeight={64}
            renderItem={item => (
              <div className="group hover:bg-content2/70 rounded-large flex items-center gap-3 p-2 transition-colors">
                <button
                  type="button"
                  onClick={() => handlePlay(item)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Image
                    removeWrapper
                    src={item.cover}
                    params={THUMB_PARAMS}
                    className="rounded-medium h-[48px] w-[48px] flex-none object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.title}</div>
                    <div className="text-default-500 mt-0.5 flex items-center gap-2 truncate text-xs">
                      <span>{sourceLabel(item)}</span>
                      {item.ownerName ? <span className="truncate">{item.ownerName}</span> : null}
                      <span className="flex-none">{moment(item.playedAt).format("MM-DD HH:mm")}</span>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  aria-label="移除这条播放记录"
                  onClick={() => handleRemove(item)}
                  className="text-default-500 hover:text-danger flex-none p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <RiDeleteBinLine size={16} />
                </button>
              </div>
            )}
          />
        </div>
      )}
    </ScrollContainer>
  );
};

export default PlayHistory;
