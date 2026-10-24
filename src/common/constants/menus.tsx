import {
  RiAlbumFill,
  RiAlbumLine,
  RiCalendarScheduleFill,
  RiCalendarScheduleLine,
  RiDiscFill,
  RiDiscLine,
  RiFileDownloadFill,
  RiFileDownloadLine,
  RiFireFill,
  RiFireLine,
  RiFolderMusicFill,
  RiFolderMusicLine,
  RiHeartFill,
  RiHeartLine,
  RiHistoryFill,
  RiHistoryLine,
  RiHomeLine,
  RiHomeFill,
  RiPlayListFill,
  RiPlayListLine,
  RiSearchFill,
  RiSearchLine,
  RiTimeFill,
  RiTimeLine,
  RiUserFollowFill,
  RiUserFollowLine,
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

/** 菜单归属：通用能力 / 哔哩哔哩专属 / 网易云专属 */
export type MenuSource = "common" | "bilibili" | "netease";

export interface AppMenuItem extends MenuItemProps {
  /** 需要登录（哪个账号由所属分组决定） */
  needLogin?: boolean;
  source?: MenuSource;
}

/**
 * 通用分组 —— **与音源无关的能力**。
 *
 * Beta 8 之前这些散落在「哔哩哔哩」组里（本地音乐、下载记录），
 * 一个网易云用户看到「下载记录」被归在 B 站下面会觉得莫名其妙。
 * 现在单独成组，只有一个例外：「我喜欢的音乐」按首选音源跳转，见下方注释。
 */
export const getCommonMenuList = (): AppMenuItem[] => [
  {
    title: t("主页"),
    href: "/",
    source: "common",
    icon: RiHomeLine,
    activeIcon: RiHomeFill,
  },
  {
    title: t("搜索"),
    href: "/search",
    source: "common",
    icon: RiSearchLine,
    activeIcon: RiSearchFill,
  },
  {
    title: t("播放历史"),
    href: "/play-history",
    source: "common",
    icon: RiTimeLine,
    activeIcon: RiTimeFill,
  },
  {
    title: t("本地音乐"),
    href: "/local-music",
    source: "common",
    icon: RiFolderMusicLine,
    activeIcon: RiFolderMusicFill,
  },
  {
    title: t("下载记录"),
    href: "/download-list",
    source: "common",
    icon: RiFileDownloadLine,
    activeIcon: RiFileDownloadFill,
  },
];

/**
 * 「我喜欢的音乐」是一条**跨音源**的入口：点击后进哪个页面由「首选音乐源」决定。
 *
 * - 网易云：直接进 `/netease/liked`（网易云只有一个「我喜欢的音乐」）
 * - 哔哩哔哩：没有单一集合，进**默认收藏夹**（用户自建的第一个收藏夹，与 B 站客户端一致）
 *
 * 两边都进不去（没登录 / 没收藏夹）时返回 `undefined`，由调用方决定怎么提示，
 * **不要**悄悄回落到另一家 —— 那会让人以为自己点错了。
 */
export const resolveLikedMusicHref = (props: {
  source: MusicSource;
  neteaseLoggedIn: boolean;
  bilibiliLoggedIn: boolean;
  firstCreatedFavoriteId?: number;
  userMid?: number | string;
}): string | undefined => {
  const { source, neteaseLoggedIn, bilibiliLoggedIn, firstCreatedFavoriteId, userMid } = props;

  if (source === "netease") {
    return neteaseLoggedIn ? "/netease/liked" : undefined;
  }

  if (!bilibiliLoggedIn || !firstCreatedFavoriteId) return undefined;
  return userMid ? `/collection/${firstCreatedFavoriteId}?mid=${userMid}` : `/collection/${firstCreatedFavoriteId}`;
};

/**
 * 哔哩哔哩分组 —— 只放**这家平台独有**的东西。
 *
 * 原来混在这里的「本地音乐」「下载记录」已经移到通用分组。
 */
export const getBilibiliMenuList = (): AppMenuItem[] => [
  {
    title: t("推荐音乐"),
    href: "/recommend",
    source: "bilibili",
    icon: RiDiscLine,
    activeIcon: RiDiscFill,
  },
  {
    title: t("我的关注"),
    href: "/follow",
    needLogin: true,
    source: "bilibili",
    icon: RiUserFollowLine,
    activeIcon: RiUserFollowFill,
  },
  {
    title: t("稍后再看"),
    href: "/later",
    needLogin: true,
    source: "bilibili",
    icon: RiCalendarScheduleLine,
    activeIcon: RiCalendarScheduleFill,
  },
  {
    title: t("历史记录"),
    href: "/history",
    needLogin: true,
    source: "bilibili",
    icon: RiHistoryLine,
    activeIcon: RiHistoryFill,
  },
];

/**
 * 网易云分组。
 *
 * 和 B 站那组**并存**（不是二选一）：侧栏会一直同时显示两组，
 * 搜索页那个「B站 / 网易云」开关只决定搜索走哪家，不控制侧栏显示什么。
 *
 * `needLogin` 指的是**网易云账号**（`useNetease`），不是 B 站账号 ——
 * 「热门歌单」不需要登录，所以没标。
 *
 * 「我喜欢的音乐」已经移到通用分组（按首选音源跳转），这里不再重复放一条。
 */
export const getNeteaseMenuList = (): AppMenuItem[] => [
  {
    title: t("我的歌单"),
    href: "/netease/playlists",
    needLogin: true,
    source: "netease",
    icon: RiPlayListLine,
    activeIcon: RiPlayListFill,
  },
  {
    title: t("我的专辑"),
    href: "/netease/albums",
    needLogin: true,
    source: "netease",
    icon: RiAlbumLine,
    activeIcon: RiAlbumFill,
  },
  {
    title: t("热门歌单"),
    href: "/netease/hot",
    source: "netease",
    icon: RiFireLine,
    activeIcon: RiFireFill,
  },
];

/** 「我喜欢的音乐」那条跨音源菜单项的图标（跟音源无关，固定用心形） */
export const LIKED_MUSIC_ICONS = { icon: RiHeartLine, activeIcon: RiHeartFill };
