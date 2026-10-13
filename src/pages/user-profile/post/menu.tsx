import { RiFileMusicLine, RiFileVideoLine, RiPlayCircleLine, RiPlayListAddLine, RiStarLine } from "@remixicon/react";

import { t } from "@/common/i18n";

export const getContextMenus = () => {
  return [
    {
      icon: <RiStarLine size={18} />,
      key: "favorite",
      label: t("收藏"),
    },
    {
      icon: <RiPlayCircleLine size={18} />,
      key: "play-next",
      label: t("下一首播放"),
    },
    {
      icon: <RiPlayListAddLine size={18} />,
      key: "add-to-playlist",
      label: t("添加到播放列表"),
    },
    {
      icon: <RiFileMusicLine size={18} />,
      key: "download-audio",
      label: t("下载音频"),
    },
    {
      icon: <RiFileVideoLine size={18} />,
      key: "download-video",
      label: t("下载视频"),
    },
  ];
};
