import React from "react";

import { Divider } from "@heroui/react";

import deepseekAvatar from "@/assets/images/developers/deepseek.png";
import kayokoAvatar from "@/assets/images/developers/kayoko.png";
// 「?url」是必须的：项目里的 svgr 把 *.svg 转成了 React 组件（只导出 ReactComponent），
// 直接 default import 拿到的是 undefined，构建期报 ESModulesLinkingError。
import qicwkenAvatar from "@/assets/images/developers/qicwken.jpg?url";
import wumiuAvatar from "@/assets/images/developers/wumiu.png";
import { t } from "@/common/i18n";

/**
 * 开发者署名。
 *
 * 头像是构建期静态资源（都在 10KB 以内，会被 rsbuild 内联成 data URI），
 * 所以不依赖网络，也不受代理设置影响。
 */
const DEVELOPERS: { name: string; avatar: string; role?: string }[] = [
  { name: "会点技术的佳代子", avatar: kayokoAvatar },
  { name: "无谬Wumiu", avatar: wumiuAvatar },
  { name: "qicwken", avatar: qicwkenAvatar, role: "国内下载渠道" },
  { name: "DeepSeek", avatar: deepseekAvatar },
];

/**
 * 设置页最底部的开发者署名条。
 *
 * 刻意做成居中 + 弱化的样式：上面的 Tab 内容是左对齐的表单，
 * 这一块居中可以一眼看出是「署名」而不是又一个设置项。
 */
const Developers = () => (
  <>
    <Divider className="mt-10" />
    <section className="flex flex-col items-center gap-5 pt-7 pb-2">
      <span className="text-default-500 text-sm">{t("开发者")}</span>
      <ul className="flex flex-wrap items-center justify-center gap-x-9 gap-y-4">
        {DEVELOPERS.map(({ name, avatar, role }) => (
          <li key={name} className="group flex items-center gap-3">
            <img
              src={avatar}
              alt={name}
              width={40}
              height={40}
              draggable={false}
              className="ring-default-300/60 size-10 shrink-0 rounded-full object-cover shadow-sm ring-1 transition-transform duration-200 group-hover:scale-105"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium whitespace-nowrap">{name}</span>
              {role && <span className="text-default-400 text-xs whitespace-nowrap">{t(role)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  </>
);

export default Developers;
