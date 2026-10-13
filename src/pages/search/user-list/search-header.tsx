import React from "react";

import { Tab, Tabs } from "@heroui/react";

import { t } from "@/common/i18n";

import type { UserSortKey } from "./utils";

interface SearchHeaderProps {
  sortKey: UserSortKey;
  onSortChange: (key: UserSortKey) => void;
}

const getSortOptions = (): { label: string; value: UserSortKey }[] => [
  { label: t("默认排序"), value: "default" },
  { label: t("粉丝数由高到低"), value: "fans_desc" },
  { label: t("粉丝数由低到高"), value: "fans_asc" },
  { label: t("Lv等级由高到低"), value: "level_desc" },
  { label: t("Lv等级由低到高"), value: "level_asc" },
];

export default function SearchHeader({ sortKey, onSortChange }: SearchHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 pb-4">
      <Tabs
        variant="light"
        radius="md"
        classNames={{
          cursor: "rounded-medium",
        }}
        className="-ml-1"
        selectedKey={sortKey}
        onSelectionChange={key => onSortChange(key as UserSortKey)}
      >
        {getSortOptions().map(option => (
          <Tab key={option.value} title={option.label} />
        ))}
      </Tabs>
    </div>
  );
}
