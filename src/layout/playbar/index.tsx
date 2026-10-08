import { useEffect } from "react";

import { Card } from "@heroui/react";

import { usePlayList } from "@/store/play-list";

import Center from "./center";
import Left from "./left";
import Right from "./right";

/**
 * 播放任务栏
 */
function PlayBar() {
  const playId = usePlayList(s => s.playId);
  const init = usePlayList(s => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    /*
     * 不再自带 glass-bar 磨砂层：播放栏现在是外层大面板里的一栏，
     * 磨砂由面板那一层负责（重复叠一层会让这块比别处更不透明）。
     * 和内容区的分隔靠上层 wrapper 的 border-t。
     */
    <Card
      radius="none"
      shadow="none"
      className="grid h-full grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,1fr)] px-4"
    >
      <div className="h-full">{Boolean(playId) && <Left />}</div>
      <Center />
      <Right />
    </Card>
  );
}

export default PlayBar;
