import {
  RiExternalLinkLine,
  RiFileMusicLine,
  RiFileVideoLine,
  RiPlayCircleLine,
  RiPlayListAddLine,
  RiStarLine,
  RiStarOffLine,
} from "@remixicon/react";

import { t } from "@/common/i18n";

interface Props {
  /** 2:视频稿件 12:音频 21:视频合集 24:电影 */
  type: number;
  isCreatedBySelf: boolean;
}

export const getContextMenus = ({ type, isCreatedBySelf }: Props) => {
  const isAudio = type === 12;
  const canNotPlay = ![2, 12].includes(type);

  return [
    {
      icon: <RiStarLine size={18} />,
      key: "favorite",
      label: isCreatedBySelf ? t("移动") : t("收藏"),
    },
    {
      icon: <RiStarOffLine size={18} />,
      key: "cancelFavorite",
      label: t("取消收藏"),
      hidden: !isCreatedBySelf,
    },
    {
      icon: <RiPlayCircleLine size={18} />,
      key: "play-next",
      label: t("下一首播放"),
      hidden: canNotPlay,
    },
    {
      icon: <RiPlayListAddLine size={18} />,
      key: "add-to-playlist",
      label: t("添加到播放列表"),
      hidden: canNotPlay,
    },
    {
      icon: <RiFileMusicLine size={18} />,
      key: "download-audio",
      label: t("下载音频"),
      hidden: canNotPlay,
    },
    {
      icon: <RiFileVideoLine size={18} />,
      key: "download-video",
      label: t("下载视频"),
      hidden: canNotPlay || isAudio,
    },
    {
      icon: <RiExternalLinkLine size={18} />,
      key: "bililink",
      label: t("在 B 站打开"),
    },
  ];
};
