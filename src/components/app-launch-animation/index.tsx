import { useCallback, useEffect, useState } from "react";

import clsx from "classnames";

import { isAuxiliaryWindow } from "@/common/utils/lyrics-render";
import { useSettings } from "@/store/settings";

/**
 * app 打开动画 —— 启动时盖住整窗的开场画面。
 *
 * 三种形态（见 app-settings 的 appLaunchAnimation）：关闭 / 内置（淡入、图标淡入、图标呼吸）
 * / 播放用户自己选的视频。播放期间点任意处或按任意键可以跳过。
 *
 * 两个关键取舍：
 *
 * 1. **第一帧就把整窗盖住，水合完再决定播什么。**
 *    设置是从主进程异步水合回来的，水合前 store 里是默认值 ——
 *    如果直接按默认值开播，一个已经选了「无动画」的用户会先看到一段动画再消失。
 *    所以水合前只盖一层底色（跟界面同色，看不出来），水合后才开始播或直接撤掉。
 *
 * 2. **视频走 Blob URL 而不是 data URL。** 视频动辄几十 MB，
 *    base64 还要再胖三分之一，而 Blob 是零拷贝引用，`<video>` 也能正常 seek。
 */
const LEAVE_MS = 300;

/** 视频模式的最长等待：文件损坏或编码不支持时别把界面永久挡住 */
const VIDEO_HARD_CAP_MS = 15000;
/** 视频迟迟没起来（没有能播的首帧）就早点收工 */
const VIDEO_START_TIMEOUT_MS = 4000;
/** 和主进程的 MAX_LAUNCH_VIDEO_BYTES 保持一致 */
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;

/**
 * app 图标（显示器 + 音符 + 支架条），和 electron/icons 里那张同一套形状。
 * 直接内联而不是 import svg：这样 currentColor 才能跟着主题走，
 * 也不用去猜构建里 svg 是按组件还是按 URL 处理。
 */
const BrandMark = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 192 154" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <rect x="51" y="141" width="90" height="13" rx="6.5" fill="currentColor" />
    <path d="M92 32.3 L124 23.6 L124 48.3 L92 56.3 Z" fill="currentColor" />
    <rect x="92" y="33" width="7" height="63" fill="currentColor" />
    <ellipse cx="83.5" cy="90.5" rx="16" ry="13.4" transform="rotate(-27 83.5 90.5)" fill="currentColor" />
    <rect x="6" y="6" width="180" height="116" rx="9" fill="none" stroke="currentColor" strokeWidth="12" />
  </svg>
);

type Phase = "cover" | "playing" | "leaving" | "done";

/**
 * 辅助窗（迷你播放器 / 桌面歌词）不播开场动画。
 * 窗口类型一旦加载就固定，模块级算一次即可 —— 和「桌面歌词窗要判 hash」同一个理由：
 * routes.tsx 静态 import 所有页面，这个模块在每个窗口里都会被求值。
 */
const isAuxWindow = isAuxiliaryWindow();

const AppLaunchAnimation = () => {
  const mode = useSettings(s => s.appLaunchAnimation);
  const duration = useSettings(s => s.appLaunchAnimationDuration);
  const videoPath = useSettings(s => s.appLaunchAnimationVideo);

  const [phase, setPhase] = useState<Phase>("cover");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoStarted, setVideoStarted] = useState(false);

  const [hydrated, setHydrated] = useState(() => useSettings.persist.hasHydrated());
  useEffect(() => {
    if (hydrated || isAuxWindow) return;
    return useSettings.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  const finish = useCallback(() => {
    setPhase(current => (current === "leaving" || current === "done" ? current : "leaving"));
  }, []);

  // 水合完成才决定：播动画，还是直接把盖子撤掉
  useEffect(() => {
    if (!hydrated || isAuxWindow || phase !== "cover") return;

    // 系统开了「减少动态效果」就当作无动画，不给用户添堵
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (mode === "none" || reduceMotion) setPhase("done");
    else setPhase("playing");
  }, [hydrated, mode, phase]);

  // 收工后真正卸掉（等淡出动画放完）
  useEffect(() => {
    if (isAuxWindow || phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("done"), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // 内置动画：到点收工
  useEffect(() => {
    if (isAuxWindow || phase !== "playing" || mode === "video") return;
    const timer = window.setTimeout(finish, Math.max(400, duration));
    return () => window.clearTimeout(timer);
  }, [phase, mode, duration, finish]);

  // 视频模式：正常靠 ended 收工，这两个是兜底
  useEffect(() => {
    if (isAuxWindow || phase !== "playing" || mode !== "video") return;
    const hardCap = window.setTimeout(finish, VIDEO_HARD_CAP_MS);
    const notStarted = videoStarted ? null : window.setTimeout(finish, VIDEO_START_TIMEOUT_MS);
    return () => {
      window.clearTimeout(hardCap);
      if (notStarted) window.clearTimeout(notStarted);
    };
  }, [phase, mode, videoStarted, finish]);

  // 读视频字节 → Blob URL。**不要**把 phase 放进依赖：淡出时重建 URL 会让画面黑一下
  useEffect(() => {
    if (isAuxWindow || mode !== "video" || !videoPath) return;

    let alive = true;
    let created = "";
    void window.electron?.readLaunchVideo?.(videoPath).then(result => {
      if (!result?.data || result.data.byteLength > MAX_VIDEO_BYTES) return;

      // TS 5.7 起 Uint8Array 带上了 ArrayBufferLike 泛型，不能直接当 BlobPart。
      // Electron 传回来的是一段独立字节，正常情况下直接取底层 buffer，不用再拷一遍。
      const { data } = result;
      const bytes =
        data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data.buffer : data.slice().buffer;
      created = URL.createObjectURL(new Blob([bytes as ArrayBuffer], { type: result.mime }));

      if (alive) setVideoUrl(created);
      else URL.revokeObjectURL(created);
    });

    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
      setVideoUrl("");
      setVideoStarted(false);
    };
  }, [mode, videoPath]);

  // 播放期间按任意键跳过
  useEffect(() => {
    if (isAuxWindow || phase !== "playing") return;
    const onKeyDown = () => finish();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, finish]);

  // 辅助窗（迷你播放器 / 桌面歌词）不播开场动画
  if (isAuxWindow || phase === "done") return null;

  const playing = phase === "playing";
  const showVideo = playing && mode === "video" && videoUrl;
  const showMark = playing && mode !== "video" && mode !== "fade";

  return (
    <div
      className={clsx("app-launch-overlay", phase === "leaving" && "app-launch-overlay--leaving")}
      style={{ borderRadius: "var(--window-radius)" }}
      onClick={playing ? finish : undefined}
    >
      {playing ? (
        <>
          {showVideo ? (
            <video
              className="app-launch-video"
              src={videoUrl}
              autoPlay
              muted
              playsInline
              onEnded={finish}
              onError={finish}
              onLoadedData={() => setVideoStarted(true)}
            />
          ) : null}

          {showMark ? (
            <>
              {mode === "pulse" ? <span className="app-launch-ring" /> : null}
              <BrandMark
                className={clsx(
                  "app-launch-mark",
                  mode === "pulse" ? "app-launch-mark--pulse" : "app-launch-mark--logo",
                )}
              />
            </>
          ) : null}

          <div className="app-launch-hint">点击任意处跳过</div>
        </>
      ) : null}
    </div>
  );
};

export default AppLaunchAnimation;
