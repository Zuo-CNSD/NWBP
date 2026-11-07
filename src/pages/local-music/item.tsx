import React from "react";

import { Button } from "@heroui/react";
import {
  RiDeleteBinLine,
  RiFileMusicLine,
  RiMusic2Line,
  RiPlayCircleLine,
  RiPlayFill,
  RiPlayListAddLine,
} from "@remixicon/react";
import clsx from "classnames";
import { filesize } from "filesize";

import { t } from "@/common/i18n";
import { formatDuration, formatMillisecond } from "@/common/utils/time";
import ContextMenu from "@/components/context-menu";

import OperationMenu, { type LocalOperationItem } from "./operation";

interface Props {
  data: LocalMusicItem;
  isPlaying: boolean;
  index: number;
  onAddToNext: () => void;
  onAddToPlayList: () => void;
  onPlay: () => void;
  onOpen: () => void;
  onDelete: () => void;
  displayMode?: "list" | "card" | "compact";
}

const getMenus = (): LocalOperationItem[] => [
  { key: "nextplay", label: t("下一首播放"), icon: <RiPlayCircleLine size={18} /> },
  { key: "play", label: t("添加到播放列表"), icon: <RiPlayListAddLine size={18} /> },
  { key: "open", label: t("打开文件"), icon: <RiFileMusicLine size={18} /> },
  {
    key: "delete",
    label: t("删除文件"),
    color: "danger",
    className: "text-danger",
    icon: <RiDeleteBinLine size={18} />,
  },
];

const LocalMusicItemRow = ({
  data,
  isPlaying,
  index,
  onAddToNext,
  onAddToPlayList,
  onPlay,
  onOpen,
  onDelete,
  displayMode = "list",
}: Props) => {
  const [isOpOpen, setIsOpOpen] = React.useState(false);
  const menuItems = getMenus();
  const items = isPlaying ? menuItems.filter(m => m.key !== "delete") : menuItems;

  const onAction = (key: string) => {
    if (key === "nextplay") onAddToNext();
    if (key === "play") onAddToPlayList();
    if (key === "open") onOpen();
    if (key === "delete") onDelete();
  };

  if (displayMode === "card") {
    return (
      <ContextMenu
        items={items}
        onAction={onAction}
        contentClassName="w-[160px]"
        className="h-full"
        disabled={isOpOpen}
      >
        <div
          role="button"
          tabIndex={0}
          className={clsx(
            "local-music-card bg-content1 group flex h-full min-h-[190px] flex-col rounded-xl border p-3",
            {
              "border-default-200": !isPlaying,
              "border-primary": isPlaying,
              "local-music-card-playing": isPlaying,
            },
          )}
          onClick={onPlay}
          onKeyDown={event => {
            if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onPlay();
            }
          }}
        >
          <div className="local-music-card-art bg-default-100 flex flex-1 items-center justify-center rounded-lg">
            <RiMusic2Line size={42} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-medium" title={data.title}>
              {data.title}
            </span>
            <span onClick={event => event.stopPropagation()}>
              <OperationMenu items={items} onOpenChange={setIsOpOpen} onAction={onAction} />
            </span>
          </div>
          <div className="text-foreground-500 mt-1 flex justify-between text-xs">
            <span>{data.format?.toUpperCase() || "-"}</span>
            <span>{typeof data.duration === "number" ? formatDuration(Math.round(data.duration)) : "-"}</span>
          </div>
        </div>
      </ContextMenu>
    );
  }

  return (
    <ContextMenu items={items} onAction={onAction} contentClassName="w-[160px]" disabled={isOpOpen}>
      <Button
        as="div"
        radius="md"
        fullWidth
        disableAnimation
        color={isPlaying ? "primary" : "default"}
        variant={isPlaying ? "flat" : "light"}
        onDoubleClick={() => onPlay()}
        className={clsx("group rounded-medium flex w-full items-center justify-between p-2", {
          "h-9": displayMode === "compact",
        })}
      >
        <div
          className={clsx("grid w-full items-center gap-4", {
            "grid-cols-[40px_minmax(0,1fr)_100px_40px]": displayMode === "compact",
            "grid-cols-[40px_minmax(0,1fr)_100px_100px_100px_100px_40px]": displayMode !== "compact",
          })}
        >
          <div className="text-foreground-500 min-w-8 text-center text-xs tabular-nums">
            <span
              className={clsx({
                "group-hover:hidden": !isPlaying,
              })}
            >
              {index}
            </span>
            {!isPlaying && <RiPlayFill size={16} className="hidden align-middle group-hover:inline" />}
          </div>
          <div className="min-w-0 truncate">{data.title}</div>
          {displayMode !== "compact" && (
            <div className="text-foreground-500 flex justify-end text-xs tabular-nums">{filesize(data.size)}</div>
          )}
          {displayMode !== "compact" && (
            <div className="text-foreground-500 flex justify-end text-xs">{data.format?.toUpperCase() || "-"}</div>
          )}
          <div className="text-foreground-500 flex justify-end text-xs tabular-nums">
            {typeof data.duration === "number" ? formatDuration(Math.round(data.duration)) : "-"}
          </div>
          {displayMode !== "compact" && (
            <div className="text-foreground-500 flex justify-end text-xs">
              {data.createdTime ? formatMillisecond(data.createdTime) : "-"}
            </div>
          )}
          <div
            className="flex h-full items-center justify-end"
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <OperationMenu
              items={items}
              onOpenChange={open => {
                setIsOpOpen(open);
              }}
              onAction={onAction}
            />
          </div>
        </div>
      </Button>
    </ContextMenu>
  );
};
export default LocalMusicItemRow;
