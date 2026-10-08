import React from "react";

import { Divider } from "@heroui/react";

import deepseekAvatar from "@/assets/images/developers/deepseek.png";
import kayokoAvatar from "@/assets/images/developers/kayoko.png";
import wumiuAvatar from "@/assets/images/developers/wumiu.png";

/**
 * 开发者署名。
 *
 * 头像是构建期静态资源（都在 10KB 以内，会被 rsbuild 内联成 data URI），
 * 所以不依赖网络，也不受代理设置影响。
 */
const DEVELOPERS = [
  { name: "会点技术的佳代子", avatar: kayokoAvatar },
  { name: "无谬Wumiu", avatar: wumiuAvatar },
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
      <span className="text-default-500 text-sm">开发者</span>
      <ul className="flex flex-wrap items-center justify-center gap-x-9 gap-y-4">
        {DEVELOPERS.map(({ name, avatar }) => (
          <li key={name} className="group flex items-center gap-3">
            <img
              src={avatar}
              alt={name}
              width={40}
              height={40}
              draggable={false}
              className="ring-default-300/60 size-10 shrink-0 rounded-full object-cover shadow-sm ring-1 transition-transform duration-200 group-hover:scale-105"
            />
            <span className="text-sm font-medium whitespace-nowrap">{name}</span>
          </li>
        ))}
      </ul>
    </section>
  </>
);

export default Developers;
