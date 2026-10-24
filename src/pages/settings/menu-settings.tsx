import React from "react";
import { type Control, Controller } from "react-hook-form";

import { getBilibiliMenuList, getCommonMenuList, getNeteaseMenuList, type AppMenuItem } from "@/common/constants/menus";
import { t } from "@/common/i18n";
import SelectAllCheckboxGroup from "@/components/select-all-checkbox-group";
import { useFavoritesStore } from "@/store/favorite";
import { useNetease } from "@/store/netease";
import { useUser } from "@/store/user";

interface MenuSettingsProps {
  control: Control<AppSettings>;
}

/**
 * 菜单显隐设置。
 *
 * 三个「固定菜单组」+ 两组「用户自建」（B 站收藏夹）共用同一个 `hiddenMenuKeys` 数组：
 * 每个分组只管自己那批 key，改动时把别的分组的隐藏项原样留着，否则一保存就把别处恢复显示。
 */
const MenuSettings: React.FC<MenuSettingsProps> = ({ control }) => {
  const user = useUser(state => state.user);
  const neteaseLoggedIn = useNetease(state => Boolean(state.account?.loggedIn));
  const createdFavorites = useFavoritesStore(state => state.createdFavorites);
  const collectedFavorites = useFavoritesStore(state => state.collectedFavorites);

  const groups: { key: string; label: string; list: () => AppMenuItem[]; loggedIn: boolean }[] = [
    { key: "common", label: t("通用"), list: getCommonMenuList, loggedIn: true },
    { key: "bilibili", label: t("哔哩哔哩"), list: getBilibiliMenuList, loggedIn: Boolean(user?.isLogin) },
    { key: "netease", label: t("网易云"), list: getNeteaseMenuList, loggedIn: neteaseLoggedIn },
  ];

  return (
    <div className="space-y-6">
      <h2>{t("设置侧边菜单项显示和隐藏")}</h2>
      <div className="w-full space-y-8">
        {groups.map(group => (
          <div key={group.key} className="flex w-full items-start space-x-[100px]">
            <div className="text-medium font-medium">{group.label}</div>
            <div className="max-w-[480px]">
              <Controller
                control={control}
                name="hiddenMenuKeys"
                render={({ field }) => {
                  const groupKeys = group
                    .list()
                    .filter(i => i.href)
                    .map(i => i.href!);
                  const selectedKeys = groupKeys.filter(k => !field.value.includes(k));

                  const handleSelectionChange = (newSelectedKeys: string[]) => {
                    const outsideHidden = field.value.filter(k => !groupKeys.includes(k));
                    const hiddenInGroup = groupKeys.filter(k => !newSelectedKeys.includes(k));
                    field.onChange(Array.from(new Set([...outsideHidden, ...hiddenInGroup])));
                  };

                  const items = group
                    .list()
                    .filter(i => i.href)
                    .filter(i => (group.loggedIn ? true : !i.needLogin))
                    .map(item => ({ value: item.href!, label: item.title }));

                  return (
                    <SelectAllCheckboxGroup
                      groupName={group.label}
                      groupKeys={groupKeys}
                      selectedKeys={selectedKeys}
                      onSelectionChange={handleSelectionChange}
                      disabled={!groupKeys.length}
                      items={items}
                    />
                  );
                }}
              />
            </div>
          </div>
        ))}

        {user?.isLogin && (
          <>
            <div className="flex w-full items-start space-x-[100px]">
              <div className="text-medium font-medium">{t("个人创建菜单")}</div>
              <div className="max-w-[480px]">
                <Controller
                  control={control}
                  name="hiddenMenuKeys"
                  render={({ field }) => {
                    const groupKeys = (createdFavorites ?? []).map(i => String(i.id));
                    const selectedKeys = groupKeys.filter(k => !field.value.includes(k));

                    const handleSelectionChange = (newSelectedKeys: string[]) => {
                      const outsideHidden = field.value.filter(k => !groupKeys.includes(k));
                      const hiddenInGroup = groupKeys.filter(k => !newSelectedKeys.includes(k));
                      const nextHidden = Array.from(new Set([...outsideHidden, ...hiddenInGroup]));
                      field.onChange(nextHidden);
                    };

                    const ownFolderMap = new Map((createdFavorites ?? []).map(i => [String(i.id), i.title]));
                    const items = groupKeys.map(key => ({
                      value: key,
                      label: ownFolderMap.get(key) || key,
                    }));

                    return (
                      <SelectAllCheckboxGroup
                        groupName={t("个人创建菜单")}
                        groupKeys={groupKeys}
                        selectedKeys={selectedKeys}
                        onSelectionChange={handleSelectionChange}
                        disabled={!groupKeys.length}
                        items={items}
                      />
                    );
                  }}
                />
              </div>
            </div>
            <div className="flex w-full items-start space-x-[100px]">
              <div className="text-medium font-medium">{t("个人收藏菜单")}</div>
              <div className="max-w-[480px]">
                <Controller
                  control={control}
                  name="hiddenMenuKeys"
                  render={({ field }) => {
                    const groupKeys = (collectedFavorites ?? []).map(i => String(i.id));
                    const selectedKeys = groupKeys.filter(k => !field.value.includes(k));

                    const handleSelectionChange = (newSelectedKeys: string[]) => {
                      const outsideHidden = field.value.filter(k => !groupKeys.includes(k));
                      const hiddenInGroup = groupKeys.filter(k => !newSelectedKeys.includes(k));
                      const nextHidden = Array.from(new Set([...outsideHidden, ...hiddenInGroup]));
                      field.onChange(nextHidden);
                    };

                    const collectedFolderMap = new Map((collectedFavorites ?? []).map(i => [String(i.id), i.title]));
                    const items = groupKeys.map(key => ({
                      value: key,
                      label: collectedFolderMap.get(key) || key,
                    }));

                    return (
                      <SelectAllCheckboxGroup
                        groupName={t("个人收藏菜单")}
                        groupKeys={groupKeys}
                        selectedKeys={selectedKeys}
                        onSelectionChange={handleSelectionChange}
                        disabled={!groupKeys.length}
                        items={items}
                      />
                    );
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MenuSettings;
