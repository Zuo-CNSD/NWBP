import { RiOrderPlayLine, RiRepeat2Line, RiRepeatOneLine, RiShuffleLine } from "@remixicon/react";

import { t } from "@/common/i18n";

export const PlayRate = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * 播放模式
 */
export enum PlayMode {
  /**
   * 顺序播放
   */
  Sequence = 1,
  /**
   * 循环播放
   */
  Loop = 2,
  /**
   * 随机播放
   */
  Random = 3,
  /**
   * 单曲播放
   */
  Single = 4,
}

export const getPlayModeList = (iconSize?: number) => [
  {
    value: PlayMode.Sequence,
    desc: t("顺序播放"),
    icon: <RiOrderPlayLine size={iconSize} />,
  },
  {
    value: PlayMode.Loop,
    desc: t("循环播放"),
    icon: <RiRepeat2Line size={iconSize} />,
  },
  {
    value: PlayMode.Random,
    desc: t("随机播放"),
    icon: <RiShuffleLine size={iconSize} />,
  },
  {
    value: PlayMode.Single,
    desc: t("单曲播放"),
    icon: <RiRepeatOneLine size={iconSize} />,
  },
];

/** 从低到高音质排，最高为无损 */
export const audioQualitySort = [30257, 30216, 30259, 30260, 30232, 30280, 30250, 30251];
