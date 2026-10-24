import React, { useState } from "react";

import { addToast, Tooltip, Listbox, ListboxItem } from "@heroui/react";
import { RiDownload2Fill, RiFileImageLine, RiFileMusicLine, RiFileVideoLine } from "@remixicon/react";

import { t } from "@/common/i18n";
import { resolveDownloadSource, toNeteaseLevel } from "@/common/utils/download";
import AsyncButton from "@/components/async-button";
import IconButton from "@/components/icon-button";
import { usePlayList } from "@/store/play-list";
import { useSettings } from "@/store/settings";

const MusicDownloadButton = () => {
  const list = usePlayList(s => s.list);
  const playId = usePlayList(s => s.playId);
  const playItem = list.find(item => item.id === playId);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  /*
   * 来源解析统一走 `resolveDownloadSource`。
   * 网易云曲目的直链要在这里先换出来（主进程没有网易云接口），
   * 换不到就明确报错，别丢一个「必然失败」的任务进下载页。
   */
  /*
   * `targetFormat` 默认 `original`：能拿到什么就存什么，不转码。
   * 只有用户在菜单里明确点了 MP3 / FLAC，才会在下载完成后跑一次 ffmpeg ——
   * 转码只会损失信息，默认就不该走这条路。
   */
  const downloadAudio = async (targetFormat: MediaDownloadTargetFormat = "original") => {
    if (!playItem) return;

    const resolved = await resolveDownloadSource(playItem, toNeteaseLevel(useSettings.getState().audioQuality));

    if (!resolved.ok) {
      addToast({
        title: t("无法下载"),
        description: resolved.reason,
        color: "warning",
      });
      return;
    }

    await window.electron.addMediaDownloadTask({
      outputFileType: "audio",
      title: playItem?.pageTitle || playItem?.title || `audio-${Date.now()}`,
      cover: playItem?.pageCover || playItem?.cover,
      targetFormat,
      ...resolved.source,
    });

    addToast({
      title: targetFormat === "original" ? t("已添加下载任务") : t("已添加下载任务（下载完成后转码）"),
      color: "success",
    });
  };

  const downloadVideo = async () => {
    // 网易云曲目、B 站音频站都没有视频流，别让按钮点了必失败
    if (!playItem?.bvid) {
      addToast({
        title: t("这首歌没有可下载的视频"),
        color: "warning",
      });
      return;
    }

    await window.electron.addMediaDownloadTask({
      outputFileType: "video",
      title: playItem?.pageTitle || playItem?.title || `video-${Date.now()}`,
      cover: playItem?.pageCover || playItem?.cover,
      bvid: playItem?.bvid,
      cid: playItem?.cid,
    });

    addToast({
      title: t("已添加下载任务"),
      color: "success",
    });
  };

  const downloadCover = async () => {
    const coverUrl = playItem?.pageCover || playItem?.cover;

    if (!coverUrl) {
      addToast({
        title: t("没有可下载的封面"),
        color: "warning",
      });
      return;
    }

    try {
      const response = await fetch(coverUrl);

      if (!response.ok) {
        throw new Error(t("下载失败，状态码 {0}", response.status));
      }

      const blob = await response.blob();
      const ext = blob.type?.split("/")?.[1] || "jpg";
      const name = (playItem?.pageTitle || playItem?.title || "cover").replace(/[\\/:*?"<>|]/g, "_");

      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `${name}-cover.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("未知错误");
      addToast({
        title: t("封面下载失败"),
        description: message,
        color: "danger",
      });
    }
  };

  if (playItem?.sid) {
    return (
      <AsyncButton isIconOnly size="sm" variant="light" className="hover:text-primary" onPress={() => downloadAudio()}>
        <RiDownload2Fill size={18} />
      </AsyncButton>
    );
  }

  return (
    <Tooltip
      triggerScaleOnOpen={false}
      isOpen={isTooltipOpen}
      onOpenChange={setIsTooltipOpen}
      disableAnimation
      radius="md"
      placement="top"
      closeDelay={500}
      showArrow={false}
      classNames={{
        content: "p-2",
      }}
      content={
        <Listbox
          aria-label={t("下载选项")}
          selectionMode="none"
          onAction={key => {
            if (key === "audio") {
              void downloadAudio();
            } else if (key === "audio-mp3") {
              void downloadAudio("mp3");
            } else if (key === "audio-flac") {
              void downloadAudio("flac");
            } else if (key === "video") {
              void downloadVideo();
            } else if (key === "cover") {
              void downloadCover();
            }
            setIsTooltipOpen(false);
          }}
        >
          <ListboxItem
            className="rounded-medium"
            key="audio"
            textValue={t("下载音频")}
            startContent={<RiFileMusicLine size={16} />}
          >
            {t("下载音频（原始音源）")}
          </ListboxItem>
          <ListboxItem
            className="rounded-medium"
            key="audio-mp3"
            textValue={t("转码为 MP3 320k")}
            description={t("转换会损失音质，仅在设备不认原始格式时用")}
            startContent={<RiFileMusicLine size={16} />}
          >
            {t("转码为 MP3 320k")}
          </ListboxItem>
          <ListboxItem
            className="rounded-medium"
            key="audio-flac"
            textValue={t("转码为 FLAC")}
            description={t("源本身有损时，转 FLAC 不会变好，只是文件更大")}
            startContent={<RiFileMusicLine size={16} />}
          >
            {t("转码为 FLAC")}
          </ListboxItem>
          <ListboxItem
            className="rounded-medium"
            key="video"
            textValue={t("下载视频")}
            hidden={!playItem?.bvid}
            startContent={<RiFileVideoLine size={16} />}
          >
            {t("下载视频")}
          </ListboxItem>
          <ListboxItem
            className="rounded-medium"
            key="cover"
            textValue={t("下载封面")}
            startContent={<RiFileImageLine size={16} />}
          >
            {t("下载封面")}
          </ListboxItem>
        </Listbox>
      }
    >
      <IconButton>
        <RiDownload2Fill size={18} />
      </IconButton>
    </Tooltip>
  );
};

export default MusicDownloadButton;
