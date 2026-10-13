import React from "react";

import { Tab, Tabs, Switch } from "@heroui/react";
import { RiPlayFill } from "@remixicon/react";

import type { WebSearchTypeVideoParams } from "@/service/web-interface-search-type";

import { t } from "@/common/i18n";
import AsyncButton from "@/components/async-button";

export type SortOrder = WebSearchTypeVideoParams["order"];

interface SearchHeaderProps {
  order: SortOrder;
  onOrderChange: (order: SortOrder) => void;
  musicOnly: boolean;
  onMusicOnlyChange: (value: boolean) => void;
  onPlayAll: () => void;
  playAllDisabled?: boolean;
}

const getSortOptions = (): { label: string; value: SortOrder }[] => [
  { label: t("综合排序"), value: "totalrank" },
  { label: t("最多播放"), value: "click" },
  { label: t("最新发布"), value: "pubdate" },
  { label: t("最多弹幕"), value: "dm" },
  { label: t("最多收藏"), value: "stow" },
];

export default function SearchHeader({
  order,
  onOrderChange,
  musicOnly,
  onMusicOnlyChange,
  onPlayAll,
  playAllDisabled,
}: SearchHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 pb-4">
      <Tabs
        variant="light"
        radius="md"
        classNames={{
          cursor: "rounded-medium",
        }}
        className="-ml-1"
        selectedKey={order}
        onSelectionChange={key => onOrderChange(key as SortOrder)}
      >
        {getSortOptions().map(option => (
          <Tab key={option.value} title={option.label} />
        ))}
      </Tabs>

      <div className="flex items-center gap-4">
        <AsyncButton
          color="primary"
          size="sm"
          startContent={<RiPlayFill size={18} />}
          isDisabled={playAllDisabled}
          onPress={onPlayAll}
          className="dark:text-black"
        >
          {t("全部播放")}
        </AsyncButton>
        <Switch isSelected={musicOnly} onValueChange={onMusicOnlyChange} size="sm">
          {t("仅音乐分区")}
        </Switch>
      </div>
    </div>
  );
}
