import React, { useMemo } from "react";

import { addToast } from "@heroui/react";

import { getCommonMenuList, LIKED_MUSIC_ICONS, resolveLikedMusicHref } from "@/common/constants/menus";
import { t } from "@/common/i18n";
import { resolveSourceVisibility } from "@/common/utils/source-mode";
import MenuGroup from "@/components/menu/menu-group";
import { useFavoritesStore } from "@/store/favorite";
import { useNetease } from "@/store/netease";
import { useSettings } from "@/store/settings";
import { useUser } from "@/store/user";

interface Props {
  isCollapsed?: boolean;
}

/**
 * 侧栏的**通用分组**：与音源无关的能力。
 *
 * 这一组在 Beta 8 从「哔哩哔哩」里拆出来 —— 之前本地音乐、下载记录被归在 B 站下面，
 * 网易云用户看着别扭，而且平台组该只放该平台独有的东西。
 *
 * 分组标题故意留空：它是最上面那一段，紧跟 Logo，加标题反而把侧栏切碎。
 * 下面两个带标题的平台组靠标题自然分界。
 */
const CommonMenus = ({ isCollapsed }: Props) => {
  const sourceMode = useSettings(state => state.sourceMode ?? "mixed");
  const preferredSource = useSettings(state => state.musicSource);
  const hiddenMenuKeys = useSettings(state => state.hiddenMenuKeys);

  /*
   * 「我喜欢的音乐」指向哪一家：
   * 单选模式下就是那个模式本身（界面里只剩这一家，指向别处会跳到看不见的页面）；
   * 融合模式才看首选音乐源。换算与侧栏共用同一个纯函数。
   */
  const { activeSource: source } = resolveSourceVisibility(sourceMode, preferredSource);

  const user = useUser(state => state.user);
  const neteaseLoggedIn = useNetease(state => Boolean(state.account?.loggedIn));
  const createdFavorites = useFavoritesStore(state => state.createdFavorites);

  const items = useMemo(() => {
    const base = getCommonMenuList().filter(item => item.href && !hiddenMenuKeys.includes(item.href));

    const likedHref = resolveLikedMusicHref({
      source,
      neteaseLoggedIn,
      bilibiliLoggedIn: Boolean(user?.isLogin),
      firstCreatedFavoriteId: createdFavorites[0]?.id,
      userMid: user?.mid,
    });

    /*
     * 「我喜欢的音乐」按首选音源跳转。
     *
     * 不可达时不隐藏这一项 —— 藏起来用户会以为功能被砍了。
     * 保留条目、点了给一句明确的原因（"先登录 xx"），比默默消失更好。
     */
    const likedItem = {
      title: t("我喜欢的音乐"),
      href: likedHref,
      source: "common" as const,
      ...LIKED_MUSIC_ICONS,
      onPress: likedHref
        ? undefined
        : () => {
            if (source === "netease") {
              addToast({ title: t("请先登录网易云账号"), color: "warning" });
            } else if (!user?.isLogin) {
              addToast({ title: t("请先登录哔哩哔哩账号"), color: "warning" });
            } else {
              addToast({ title: t("还没有收藏夹，先去哔哩哔哩创建一个"), color: "warning" });
            }
          },
    };

    const searchIndex = base.findIndex(item => item.href === "/search");
    if (searchIndex === -1) return [...base, likedItem];

    return [...base.slice(0, searchIndex + 1), likedItem, ...base.slice(searchIndex + 1)];
  }, [source, hiddenMenuKeys, neteaseLoggedIn, user?.isLogin, user?.mid, createdFavorites]);

  // 菜单元信息里 href 可能为空（不可达的「我喜欢的音乐」），MenuGroup 内部按 title 兜底 key
  return <MenuGroup items={items} collapsed={isCollapsed} />;
};

export default CommonMenus;
