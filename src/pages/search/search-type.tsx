import { t } from "@/common/i18n";

export enum SearchType {
  Video = "video",
  User = "bili_user",
}

/**
 * 搜索类型选项。做成函数是为了让 `label` 跟着语言走 ——
 * 常量数组在模块顶层求值，`t()` 只会跑一次。
 */
export const getSearchTypeOptions = () => [
  {
    label: t("视频"),
    value: SearchType.Video,
  },
  {
    label: t("用户"),
    value: SearchType.User,
  },
];
