import React, { useRef, useState } from "react";

import { Tab, Tabs } from "@heroui/react";

import { t } from "@/common/i18n";
import { resolveSourceVisibility } from "@/common/utils/source-mode";
import Empty from "@/components/empty";
import ScrollContainer, { type ScrollRefObject } from "@/components/scroll-container";
import { useSearchHistory } from "@/store/search-history";
import { useSettings } from "@/store/settings";

import NeteaseList from "./netease-list";
import { getSearchTypeOptions, SearchType } from "./search-type";
import UserList from "./user-list";
import VideoList from "./video-list";

const getMusicSourceOptions = (): Array<{ label: string; value: MusicSource }> => [
  { label: t("B站"), value: "bilibili" },
  { label: t("网易云"), value: "netease" },
];

const Search = () => {
  const scrollerRef = useRef<ScrollRefObject>(null);
  const [searchType, setSearchType] = useState(SearchType.Video);
  const keyword = useSearchHistory(s => s.keyword);
  const sourceMode = useSettings(s => s.sourceMode ?? "mixed");
  const preferredSource = useSettings(s => s.musicSource ?? "bilibili");
  const updateSettings = useSettings(s => s.update);

  /*
   * 单选模式下音源由「展示模式」直接决定 —— 界面里只剩这一家，
   * 允许在搜索页临时切到另一家就会搜出点不进去的结果。
   * 融合模式才把切换器露出来。
   */
  const { activeSource: musicSource, showSourceSwitch } = resolveSourceVisibility(sourceMode, preferredSource);

  const getScrollElement = () => scrollerRef.current?.osInstance()?.elements().viewport || null;

  if (!keyword) {
    return <Empty />;
  }

  const isNetease = musicSource === "netease";

  return (
    <ScrollContainer enableBackToTop ref={scrollerRef} className="h-full w-full">
      <div className="px-4">
        <h1>{t("搜索【{0}】的结果", keyword)}</h1>
        <div className="flex items-center justify-between gap-4 py-4">
          {/*
            结果类型是 B 站那套（视频 / 用户），网易云没有对应概念，
            所以切到网易云时这一排直接不显示 —— 留一个点了没反应的 tab 更糟。
          */}
          {isNetease ? (
            <span className="text-default-500 text-sm">{t("网易云单曲")}</span>
          ) : (
            <Tabs
              variant="solid"
              radius="md"
              classNames={{
                cursor: "rounded-medium",
              }}
              className="-ml-1"
              items={getSearchTypeOptions()}
              selectedKey={searchType}
              onSelectionChange={v => {
                setSearchType(v as SearchType);
              }}
            >
              {item => <Tab key={item.value} title={item.label} />}
            </Tabs>
          )}

          {/* 音源切换：只影响「找歌」这条链（搜索 → 播放 → 歌词），选择会记住 */}
          {showSourceSwitch && (
            <Tabs
              aria-label={t("歌曲音源")}
              size="sm"
              variant="bordered"
              radius="md"
              items={getMusicSourceOptions()}
              selectedKey={musicSource}
              onSelectionChange={key => {
                updateSettings({ musicSource: key as MusicSource });
              }}
            >
              {item => <Tab key={item.value} title={item.label} />}
            </Tabs>
          )}
        </div>
      </div>
      <>
        {isNetease && <NeteaseList keyword={keyword} getScrollElement={getScrollElement} />}
        {!isNetease && searchType === SearchType.Video && (
          <VideoList keyword={keyword} getScrollElement={getScrollElement} />
        )}
        {!isNetease && searchType === SearchType.User && (
          <UserList keyword={keyword} getScrollElement={getScrollElement} />
        )}
      </>
    </ScrollContainer>
  );
};

export default Search;
