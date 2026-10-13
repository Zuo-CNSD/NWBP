import {
  RiDeleteBinLine,
  RiExternalLinkLine,
  RiFileMusicLine,
  RiFileVideoLine,
  RiPlayCircleLine,
  RiPlayListAddLine,
} from "@remixicon/react";

import { t } from "@/common/i18n";

export const getContextMenus = ({ is_pgc }: { is_pgc: boolean }) => {
  const cannotPlay = is_pgc;

  return [
    {
      icon: <RiPlayCircleLine size={18} />,
      key: "play-next",
      label: t("下一首播放"),
      hidden: cannotPlay,
    },
    {
      icon: <RiPlayListAddLine size={18} />,
      key: "add-to-playlist",
      label: t("添加到播放列表"),
      hidden: cannotPlay,
    },
    {
      icon: <RiFileMusicLine size={18} />,
      key: "download-audio",
      label: t("下载音频"),
      hidden: cannotPlay,
    },
    {
      icon: <RiFileVideoLine size={18} />,
      key: "download-video",
      label: t("下载视频"),
      hidden: cannotPlay,
    },
    {
      key: "bililink",
      label: t("在 B 站打开"),
      icon: <RiExternalLinkLine size={18} />,
    },
    {
      icon: <RiDeleteBinLine size={18} />,
      key: "delete",
      label: t("移除"),
      className: "text-danger",
      color: "danger" as const,
    },
  ];
};
