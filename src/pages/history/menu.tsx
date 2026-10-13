import {
  RiDeleteBinLine,
  RiExternalLinkLine,
  RiFileMusicLine,
  RiFileVideoLine,
  RiPlayCircleLine,
  RiPlayListAddLine,
} from "@remixicon/react";

import { t } from "@/common/i18n";

export const getContextMenus = ({ business }: { business: string }) => {
  const canPlay = business === "archive";

  return [
    {
      icon: <RiPlayCircleLine size={18} />,
      key: "play-next",
      label: t("下一首播放"),
      hidden: !canPlay,
    },
    {
      icon: <RiPlayListAddLine size={18} />,
      key: "add-to-playlist",
      label: t("添加到播放列表"),
      hidden: !canPlay,
    },
    {
      icon: <RiFileMusicLine size={18} />,
      key: "download-audio",
      label: t("下载音频"),
      hidden: !canPlay,
    },
    {
      icon: <RiFileVideoLine size={18} />,
      key: "download-video",
      label: t("下载视频"),
      hidden: !canPlay,
    },
    {
      key: "bililink",
      label: t("在 B 站打开"),
      icon: <RiExternalLinkLine size={18} />,
    },
    {
      icon: <RiDeleteBinLine size={18} />,
      key: "delete",
      label: t("删除"),
      className: "text-danger",
      color: "danger" as const,
    },
  ];
};
