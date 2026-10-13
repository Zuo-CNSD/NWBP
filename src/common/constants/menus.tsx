import {
  RiDiscLine,
  RiDiscFill,
  RiUserFollowLine,
  RiUserFollowFill,
  RiFileDownloadLine,
  RiFileDownloadFill,
  RiHistoryLine,
  RiHistoryFill,
  RiCalendarScheduleLine,
  RiCalendarScheduleFill,
  RiFolderMusicLine,
  RiFolderMusicFill,
  RiHeartLine,
  RiHeartFill,
  RiPlayListLine,
  RiPlayListFill,
  RiAlbumLine,
  RiAlbumFill,
  RiFireLine,
  RiFireFill,
} from "@remixicon/react";

import { t } from "@/common/i18n";
import { type MenuItemProps } from "@/components/menu/menu-item";

/**
 * 侧栏菜单是**函数**而不是常量数组。
 *
 * 因为标题要能跟着语言变：常量数组在模块顶层求值，`t()` 只跑一次，
 * 用户在设置里换成英文后侧栏还是中文。改成函数就没这个问题 ——
 * 每次渲染都会重新取一遍标题。
 */
export const getDefaultMenuList = (): (MenuItemProps & { needLogin?: boolean })[] => [
  {
    title: t("推荐音乐"),
    href: "/recommend",
    icon: RiDiscLine,
    activeIcon: RiDiscFill,
  },
  {
    title: t("我的关注"),
    href: "/follow",
    needLogin: true,
    icon: RiUserFollowLine,
    activeIcon: RiUserFollowFill,
  },
  {
    title: t("稍后再看"),
    href: "/later",
    needLogin: true,
    icon: RiCalendarScheduleLine,
    activeIcon: RiCalendarScheduleFill,
  },
  {
    title: t("历史记录"),
    href: "/history",
    needLogin: true,
    icon: RiHistoryLine,
    activeIcon: RiHistoryFill,
  },
  {
    title: t("本地音乐"),
    href: "/local-music",
    icon: RiFolderMusicLine,
    activeIcon: RiFolderMusicFill,
  },
  {
    title: t("下载记录"),
    href: "/download-list",
    icon: RiFileDownloadLine,
    activeIcon: RiFileDownloadFill,
  },
];

/**
 * 网易云分组。
 *
 * 和上面的 B 站那组**并存**（不是二选一）：侧栏会一直同时显示两组，
 * 搜索页那个「B站 / 网易云」开关只决定搜索走哪家，不控制侧栏显示什么。
 *
 * `needLogin` 指的是**网易云账号**（`useNetease`），不是 B 站账号 ——
 * 「热门歌单」不需要登录，所以没标。
 */
export const getNeteaseMenuList = (): (MenuItemProps & { needLogin?: boolean })[] => [
  {
    title: t("我喜欢的音乐"),
    href: "/netease/liked",
    needLogin: true,
    icon: RiHeartLine,
    activeIcon: RiHeartFill,
  },
  {
    title: t("我的歌单"),
    href: "/netease/playlists",
    needLogin: true,
    icon: RiPlayListLine,
    activeIcon: RiPlayListFill,
  },
  {
    title: t("我的专辑"),
    href: "/netease/albums",
    needLogin: true,
    icon: RiAlbumLine,
    activeIcon: RiAlbumFill,
  },
  {
    title: t("热门歌单"),
    href: "/netease/hot",
    icon: RiFireLine,
    activeIcon: RiFireFill,
  },
];
