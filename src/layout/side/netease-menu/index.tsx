import React, { useMemo } from "react";

import { NeteaseMenuList } from "@/common/constants/menus";
import MenuGroup from "@/components/menu/menu-group";
import { useNetease } from "@/store/netease";
import { useSettings } from "@/store/settings";

interface Props {
  isCollapsed?: boolean;
}

/**
 * 侧栏的「网易云」分组。
 *
 * 和 B 站那组并存，一直显示。登录态看的是**网易云账号**（`useNetease`），
 * 不是 `useUser`（B 站）—— 这个 app 允许只登录其中一家。
 */
const NeteaseMenus = ({ isCollapsed }: Props) => {
  const loggedIn = useNetease(state => Boolean(state.account?.loggedIn));
  const hiddenMenuKeys = useSettings(state => state.hiddenMenuKeys);

  const items = useMemo(
    () =>
      NeteaseMenuList.filter(item => (item.needLogin ? loggedIn : true)).filter(
        item => item.href && !hiddenMenuKeys.includes(item.href),
      ),
    [loggedIn, hiddenMenuKeys],
  );

  // 一条都没剩（没登录 + 用户把热门歌单也隐藏了）就不画这个分组标题
  if (!items.length) return null;

  return <MenuGroup title="网易云" items={items} collapsed={isCollapsed} />;
};

export default NeteaseMenus;
