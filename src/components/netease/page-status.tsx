import React from "react";

import { Button, Spinner } from "@heroui/react";

import Empty from "@/components/empty";

interface Props {
  loading: boolean;
  /** 出错文案（空字符串表示没错） */
  error?: string;
  /** 加载完了但没内容 */
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
}

/**
 * 网易云几个页面的「加载中 / 出错 / 空」三态。
 *
 * 六个页面（我喜欢的音乐、我的歌单、我的专辑、热门歌单、歌单详情、专辑详情）
 * 都要这一套，抽出来省得每页抄一遍 —— 也避免某页忘了给重试按钮。
 */
const NeteasePageStatus = ({ loading, error, empty, emptyText, onRetry }: Props) => {
  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <Spinner label="加载中" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-default-500 text-sm">{error}</p>
        {onRetry && (
          <Button size="sm" variant="flat" radius="md" onPress={onRetry}>
            重试
          </Button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 px-8 text-center">
        <Empty className="min-h-0" />
        {emptyText && <p className="text-default-500 text-sm">{emptyText}</p>}
      </div>
    );
  }

  return null;
};

export default NeteasePageStatus;
