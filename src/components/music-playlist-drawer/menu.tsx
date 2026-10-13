import { RiDeleteBinLine, RiExternalLinkLine, RiFileMusicLine, RiFileVideoLine, RiStarLine } from "@remixicon/react";

import { t } from "@/common/i18n";

export const getMenus = ({
  isLogin,
  isLocal,
  hasVideo,
}: {
  isLogin: boolean;
  isLocal: boolean;
  /** 只有 B 站视频才有视频流；网易云 / B 站音频站点了必然失败 */
  hasVideo: boolean;
}) =>
  [
    {
      key: "favorite",
      label: t("收藏"),
      icon: <RiStarLine size={18} />,
      hidden: isLocal || !isLogin,
    },
    {
      key: "download-audio",
      label: t("下载音频"),
      icon: <RiFileMusicLine size={18} />,
      hidden: isLocal,
    },
    {
      icon: <RiFileVideoLine size={18} />,
      key: "download-video",
      label: t("下载视频"),
      hidden: isLocal || !hasVideo,
    },
    {
      key: "bililink",
      label: t("在 B 站打开"),
      icon: <RiExternalLinkLine size={18} />,
      hidden: isLocal,
    },
    {
      key: "del",
      color: "danger" as const,
      label: t("从列表删除"),
      icon: <RiDeleteBinLine size={18} />,
    },
  ].filter(item => !item.hidden);
