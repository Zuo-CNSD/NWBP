import { useEffect, useState } from "react";

import { RiClosedCaptioningLine, RiClosedCaptioningFill } from "@remixicon/react";

import IconButton from "../icon-button";

/**
 * 播放条上的桌面歌词开关。
 *
 * 开窗是主进程的事，所以这里只改设置 + 调一次 IPC；
 * 另外监听一下窗口真实状态：用户可能在歌词上直接点 × 关掉，
 * 那样设置里的值还是 true，开关要能跟着变回来。
 */
const DesktopLyricsButton = () => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;

    const sync = async () => {
      try {
        const [isOpen] = await Promise.all([window.electron?.desktopLyrics?.isOpen?.()]);
        if (alive && typeof isOpen === "boolean") setEnabled(isOpen);
      } catch {
        /* 拿不到就保持原样 */
      }
    };

    void sync();
    // 用户在桌面歌词窗里点 × 是主进程直接 destroy，渲染端收不到通知，
    // 用一个低频轮询兜住这种情况（开销可以忽略）
    const timer = window.setInterval(sync, 2000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await window.electron?.desktopLyrics?.setEnabled?.(next);
  };

  return (
    <IconButton
      title={enabled ? "关闭桌面歌词" : "开启桌面歌词"}
      tooltip={enabled ? "关闭桌面歌词" : "桌面歌词"}
      onPress={toggle}
      className={enabled ? "text-primary" : undefined}
    >
      {enabled ? <RiClosedCaptioningFill size={20} /> : <RiClosedCaptioningLine size={20} />}
    </IconButton>
  );
};

export default DesktopLyricsButton;
