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

import { type MenuItemProps } from "@/components/menu/menu-item";

export const DefaultMenuList: (MenuItemProps & { needLogin?: boolean })[] = [
  {
    title: "推荐音乐",
    href: "/recommend",
    icon: RiDiscLine,
    activeIcon: RiDiscFill,
  },
  {
    title: "我的关注",
    href: "/follow",
    needLogin: true,
    icon: RiUserFollowLine,
    activeIcon: RiUserFollowFill,
  },
  {
    title: "稍后再看",
    href: "/later",
    needLogin: true,
    icon: RiCalendarScheduleLine,
    activeIcon: RiCalendarScheduleFill,
  },
  {
    title: "历史记录",
    href: "/history",
    needLogin: true,
    icon: RiHistoryLine,
    activeIcon: RiHistoryFill,
  },
  {
    title: "本地音乐",
    href: "/local-music",
    icon: RiFolderMusicLine,
    activeIcon: RiFolderMusicFill,
  },
  {
    title: "下载记录",
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
export const NeteaseMenuList: (MenuItemProps & { needLogin?: boolean })[] = [
  {
    title: "我喜欢的音乐",
    href: "/netease/liked",
    needLogin: true,
    icon: RiHeartLine,
    activeIcon: RiHeartFill,
  },
  {
    title: "我的歌单",
    href: "/netease/playlists",
    needLogin: true,
    icon: RiPlayListLine,
    activeIcon: RiPlayListFill,
  },
  {
    title: "我的专辑",
    href: "/netease/albums",
    needLogin: true,
    icon: RiAlbumLine,
    activeIcon: RiAlbumFill,
  },
  {
    title: "热门歌单",
    href: "/netease/hot",
    icon: RiFireLine,
    activeIcon: RiFireFill,
  },
];
