import React, { useState } from "react";

import { RiHeadphoneLine } from "@remixicon/react";
import { twMerge } from "tailwind-merge";

import { t } from "@/common/i18n";
import IconButton from "@/components/icon-button";
import { useNetease } from "@/store/netease";
import { useNeteaseTogether } from "@/store/netease-together";

import TogetherModal from "./together-modal";

/**
 * 顶栏上的「一起听」入口。
 *
 * 只在已登录网易云时出现 —— 没登录点开也只会看到一句「请先登录」。
 *
 * ⚠️ **没放在播放栏右侧**：那一格在最小窗口宽度（1200px）下已经刚好占满
 * （6 个控件 190px + 5 个 8px 间距 = 230px = 整格宽度），再加一个必然把图标挤扁。
 * 顶栏右侧实测还有 560px 以上余量，而且它本来放的就是「全局 / 账号级」的动作。
 *
 * 成员头像不放按钮里：图标按钮是定宽的，塞两个头像进去会挤到相邻控件。
 * 头像交给封面上的角标和面板本身。
 */
const TogetherButton = () => {
  const loggedIn = useNetease(s => Boolean(s.account?.loggedIn));
  const role = useNeteaseTogether(s => s.role);
  const members = useNeteaseTogether(s => s.members);
  const [isOpen, setIsOpen] = useState(false);

  if (!loggedIn) return null;

  const inRoom = role !== "idle";
  const tip = inRoom
    ? members.length >= 2
      ? t("一起听 · {0} 人在线", members.length)
      : t("一起听 · 等待对方加入")
    : t("一起听");

  return (
    <>
      <IconButton tooltip={tip} className={twMerge(inRoom && "text-primary")} onPress={() => setIsOpen(true)}>
        <RiHeadphoneLine size={18} />
      </IconButton>
      <TogetherModal isOpen={isOpen} onOpenChange={setIsOpen} />
    </>
  );
};

export default TogetherButton;
