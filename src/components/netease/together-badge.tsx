import React from "react";

import { RiHeadphoneLine } from "@remixicon/react";

import { useNeteaseTogether } from "@/store/netease-together";

import TogetherPair from "./together-pair";

/**
 * 封面角上的房间标记：在房间时才有，绝对定位，不参与布局。
 *
 * 刻意做得小。它是一个「这首歌有人和我一起听」的暗示，不是要抢主控件的注意力。
 */
const TogetherBadge = () => {
  const role = useNeteaseTogether(s => s.role);
  const members = useNeteaseTogether(s => s.members);

  if (role === "idle") return null;

  return (
    <div className="bg-background/85 border-divider pointer-events-none absolute -top-1.5 -left-1.5 z-20 rounded-full border p-1">
      {members.length >= 2 ? (
        <TogetherPair members={members} size={13} />
      ) : (
        <RiHeadphoneLine size={13} className="text-primary block" />
      )}
    </div>
  );
};

export default TogetherBadge;
