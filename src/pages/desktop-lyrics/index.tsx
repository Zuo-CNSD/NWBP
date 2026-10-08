import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RiCloseLine, RiLockLine, RiLockUnlockLine } from "@remixicon/react";
import clsx from "classnames";

import { DESKTOP_LYRICS_CHANNEL, type DesktopLyricsMessage } from "@/common/utils/desktop-lyrics-channel";
import { findActiveLineIndex } from "@/common/utils/lyrics-render";
import { useSettings } from "@/store/settings";

import DesktopLyricsSpectrum from "./spectrum";

/**
 * 桌面歌词窗。
 *
 * 这是一个**独立渲染进程**，和主窗口通过 BroadcastChannel 同步：
 * 歌词由主窗口解析好之后整批发过来，这里只负责画 + 用 rAF 做逐字插值。
 * 好处是同一份歌词、同一个缓存，两个窗口的进度天然对齐。
 *
 * 几处关键取舍：
 *
 * 1. **底板有三档**：透明 / 纯色 / 自定义背景图（见 app-settings）。
 *    默认「透明」—— 桌面歌词不该有个黑框；需要时可切纯色或自己的图。
 *
 * 2. **默认不锁定**。锁定 = 整窗鼠标穿透，那种状态下既拖不动也点不出右键菜单，
 *    当默认值等于功能全废。只有锁定时才需要「鼠标移到右上角临时接管」那套补救逻辑。
 *
 * 3. **右键菜单用系统原生菜单**（走 IPC 交给主进程弹）。
 *    歌词窗只有 160px 高，自绘 DOM 菜单一展开就被窗口边界裁掉。
 *
 * 4. **换行有过渡动画**：整块内容用 `key={当前行下标}` 重挂，
 *    配合 app.css 里的 .lyric-line-in 做一次淡入 + 上浮。
 */

const DRAG_STYLE = { WebkitAppRegion: "drag" } as React.CSSProperties;
const NO_DRAG_STYLE = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

/** 右上角工具区尺寸：鼠标进这块才显示工具栏 */
const HOT_ZONE_WIDTH = 108;
const HOT_ZONE_HEIGHT = 44;

/** 没有底板时，文字得靠多层阴影在深浅壁纸上都读得清 */
const TEXT_SHADOW =
  "0 2px 14px rgba(0, 0, 0, 0.72), 0 1px 3px rgba(0, 0, 0, 0.85), 0 -1px 1px rgba(255, 255, 255, 0.22)";

/** 稳定引用的空柱高 = 让频谱收回基准行（内联 [] 会让子组件的 effect 每次都重跑） */
const EMPTY_BARS: number[] = [];

/** 频谱兜底拉取：每隔这么久检查一次有没有断流（ms） */
const SPECTRUM_STALE_POLL_MS = 50;
/** 超过这么久没收到柱高，就认为主窗口的推送停了（ms） */
const SPECTRUM_STALE_MS = 60;

/** #rgb / #rrggbb → rgba(r,g,b,alpha)；不是 hex 就原样返回，交给 CSS 兜底 */
const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim();
  const full = /^#([0-9a-f]{6})$/i.exec(hex);
  if (full) {
    const n = Number.parseInt(full[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const short = /^#([0-9a-f]{3})$/i.exec(hex);
  if (short) {
    const [r, g, b] = short[1].split("");
    const n = Number.parseInt(`${r}${r}${g}${g}${b}${b}`, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return hex;
};

/*
 * 整窗必须真透明。
 *
 * 桌面歌词窗和其它路由一样被包在 Theme 的 .app-shell 里，而 .app-shell 自带一层
 * 不透明底色、还会渲染 .glass-wallpaper 那张彩色底衬 —— 只把歌词自己的底板去掉，
 * 桌面依然被这两层糊住（这就是「透明模式」看着仍不透明的原因）。
 * 对应的清理写在 app.css 的 html.desktop-lyrics-window 规则里。
 *
 * 两个注意点：
 *  1. **必须判 hash**。routes.tsx 是静态 import 所有页面的，这个模块在主窗口里
 *     也会被求值 —— 不加判断就会顺手把主窗口也整成透明的。
 *  2. 放在模块作用域是为了**早于首次绘制**，放到 useEffect 里会先闪一下深色底。
 */
const isDesktopLyricsWindow = () => window.location.hash.includes("desktop-lyrics");

if (isDesktopLyricsWindow()) {
  document.documentElement.classList.add("desktop-lyrics-window");
}

const DESKTOP_LYRICS_DEFAULT_STYLE: DesktopLyricsStyle = {
  fontSize: 34,
  color: "#ffffff",
  backgroundMode: "transparent",
  backgroundOpacity: 0,
  backgroundColor: "#0e0e12",
  backgroundImage: "",
  backgroundImageBlur: 8,
  textOpacity: 100,
  showTranslation: true,
  showRomanization: false,
  spectrum: true,
  enabled: true,
  locked: false,
};

const DesktopLyrics = () => {
  const [lines, setLines] = useState<LyricSyncedLine[]>([]);
  const [currentMs, setCurrentMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasTrack, setHasTrack] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toolbarActive, setToolbarActive] = useState(false);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState("");
  /** 主窗口广播来的频谱柱高；空数组 = 还没收到，按基准线画 */
  const [bars, setBars] = useState<number[]>([]);

  const settingsFontSize = useSettings(s => s.desktopLyricsFontSize);
  const settingsColor = useSettings(s => s.desktopLyricsColor);
  const settingsBackgroundMode = useSettings(s => s.desktopLyricsBackgroundMode);
  const settingsBackgroundOpacity = useSettings(s => s.desktopLyricsBackgroundOpacity);
  const settingsBackgroundColor = useSettings(s => s.desktopLyricsBackgroundColor);
  const settingsBackgroundImage = useSettings(s => s.desktopLyricsBackgroundImage);
  const settingsBackgroundImageBlur = useSettings(s => s.desktopLyricsBackgroundImageBlur);
  const settingsTextOpacity = useSettings(s => s.desktopLyricsTextOpacity);
  const settingsTranslation = useSettings(s => s.desktopLyricsShowTranslation);
  const settingsRomanization = useSettings(s => s.desktopLyricsShowRomanization);
  const settingsSpectrum = useSettings(s => s.desktopLyricsSpectrum);
  const fontFamily = useSettings(s => s.fontFamily);
  const settingsLocked = useSettings(s => s.desktopLyricsLocked);

  // 设置页改样式时会推过来，本地留一份好即时生效
  const [style, setStyle] = useState<DesktopLyricsStyle>({
    ...DESKTOP_LYRICS_DEFAULT_STYLE,
    fontSize: settingsFontSize,
    color: settingsColor,
    backgroundMode: settingsBackgroundMode,
    backgroundOpacity: settingsBackgroundOpacity,
    backgroundColor: settingsBackgroundColor,
    backgroundImage: settingsBackgroundImage,
    backgroundImageBlur: settingsBackgroundImageBlur,
    textOpacity: settingsTextOpacity,
    showTranslation: settingsTranslation,
    showRomanization: settingsRomanization,
    spectrum: settingsSpectrum,
    locked: settingsLocked,
  });

  // locked 必须是本地 state：在这个窗里点了锁之后，
  // 主进程改了设置，但本窗的 zustand store 是独立副本、不会跟着变，
  // 直接用 store 的值会让「锁定 → 点按钮 → 再点」这一步失效。
  const [locked, setLocked] = useState(settingsLocked);

  useEffect(() => {
    setStyle({
      ...DESKTOP_LYRICS_DEFAULT_STYLE,
      fontSize: settingsFontSize,
      color: settingsColor,
      backgroundMode: settingsBackgroundMode,
      backgroundOpacity: settingsBackgroundOpacity,
      backgroundColor: settingsBackgroundColor,
      backgroundImage: settingsBackgroundImage,
      backgroundImageBlur: settingsBackgroundImageBlur,
      textOpacity: settingsTextOpacity,
      showTranslation: settingsTranslation,
      showRomanization: settingsRomanization,
      spectrum: settingsSpectrum,
      locked: settingsLocked,
    });
  }, [
    settingsFontSize,
    settingsColor,
    settingsBackgroundMode,
    settingsBackgroundOpacity,
    settingsBackgroundColor,
    settingsBackgroundImage,
    settingsBackgroundImageBlur,
    settingsTextOpacity,
    settingsTranslation,
    settingsRomanization,
    settingsSpectrum,
    settingsLocked,
  ]);

  useEffect(() => {
    setLocked(settingsLocked);
  }, [settingsLocked]);

  /*
   * 同步「整窗透明」这个标记。
   * 模块作用域那次只覆盖了「启动时就在歌词窗」的情况；
   * 从别的路由切进来（浏览器里预览时就是这样）得在这里补上，
   * 离开时再摘掉，免得影响别的页面。
   */
  useEffect(() => {
    if (isDesktopLyricsWindow()) document.documentElement.classList.add("desktop-lyrics-window");
    return () => document.documentElement.classList.remove("desktop-lyrics-window");
  }, []);

  // ---- 背景图：拿到的是路径，自己读成 data URL ----  // 不走推送负载是因为图片可能有几 MB，塞进 IPC 广播里每改一次样式就重传一次不划算
  useEffect(() => {
    const filePath = style.backgroundMode === "image" ? style.backgroundImage : "";
    if (!filePath) {
      setBackgroundImageUrl("");
      return;
    }

    let alive = true;
    void window.electron?.readBackgroundImage?.(filePath).then(url => {
      if (alive) setBackgroundImageUrl(url ?? "");
    });

    return () => {
      alive = false;
    };
  }, [style.backgroundMode, style.backgroundImage]);

  // ---- 接收主窗口广播 ----
  const channelRef = useRef<BroadcastChannel | null>(null);
  /** 上一次收到柱高的时刻，给下面的兜底拉取判「是不是断了」 */
  const lastBarsAtRef = useRef(0);

  useEffect(() => {
    const channel = new BroadcastChannel(DESKTOP_LYRICS_CHANNEL);
    channelRef.current = channel;

    channel.onmessage = event => {
      const message = event.data as DesktopLyricsMessage;
      if (message?.kind === "lines") {
        setLines(message.lines ?? []);
        setHasTrack(message.hasTrack);
        setLoading(message.loading);
        return;
      }
      if (message?.kind === "tick") {
        setCurrentMs(message.currentMs);
        setIsPlaying(message.isPlaying);
        return;
      }
      if (message?.kind === "spectrum") {
        lastBarsAtRef.current = Date.now();
        setBars(message.bars ?? []);
      }
    };

    // 打开（或重开）时向主窗口要一次全量状态
    channel.postMessage({ kind: "request-snapshot" });

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  /*
   * ---- 频谱兜底：推送断了就反过来「要」一帧 ----
   *
   * 正常路径是主窗口主动推（30fps）。但 Chromium 会冻结**不可见窗口**的定时器与动画帧：
   * 主窗口被全屏盖住、或缩到 Dock 里时，那套推送就整个停了 ——
   * 用户看到的就是「条冻住、歌词照常走」。
   *
   * 而**消息投递不受节流影响**（歌词的 tick 就是这么一路活下来的），
   * 所以由这边（可见的一侧）反过来催帧。推送正常时这段逻辑一次都不会触发。
   */
  useEffect(() => {
    if (!style.spectrum) return;

    const timer = window.setInterval(() => {
      // 没在播就不用催：那种状态本来就该停在基准行上
      if (!isPlaying) return;
      if (Date.now() - lastBarsAtRef.current < SPECTRUM_STALE_MS) return;
      channelRef.current?.postMessage({ kind: "request-spectrum" });
    }, SPECTRUM_STALE_POLL_MS);

    return () => window.clearInterval(timer);
  }, [style.spectrum, isPlaying]);

  // ---- 状态推送（开关 / 锁定 / 样式都由主进程广播） ----
  useEffect(() => {
    return window.electron?.desktopLyrics?.onStyleChanged?.(next => {
      setStyle(next);
      if (typeof next.locked === "boolean") setLocked(next.locked);
    });
  }, []);

  // ---- Ctrl / ⌘ + 滚轮调字号 ----
  // 用原生监听而不是 React 的 onWheel：需要 preventDefault 挡掉浏览器缩放，
  // 而 React 的合成事件在 wheel 上是被动监听，preventDefault 不生效。
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      void window.electron?.desktopLyrics?.adjustFontSize?.(event.deltaY > 0 ? -1 : 1);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  // ---- 右键：交给主进程弹系统菜单 ----
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    void window.electron?.desktopLyrics?.showMenu?.();
  }, []);

  // ---- 鼠标穿透的点到为止 ----
  // 只有锁定（整窗穿透）时才需要这套：Electron 的 forward 模式仍会把 mousemove
  // 送进来，靠它判断鼠标有没有进右上角工具区，进的时候临时把穿透关掉。
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const inHotZone = rect.right - event.clientX <= HOT_ZONE_WIDTH && event.clientY - rect.top <= HOT_ZONE_HEIGHT;

    if (inHotZone === toolbarActive) return;

    setToolbarActive(inHotZone);
    // 没锁的时候窗口本来就能点，不需要也不应该去动穿透状态
    if (locked) void window.electron?.desktopLyrics?.setInteractive?.(inHotZone);
  };

  const handleMouseLeave = () => {
    if (!toolbarActive) return;
    setToolbarActive(false);
    if (locked) void window.electron?.desktopLyrics?.setInteractive?.(false);
  };

  /**
   * 切换锁定。
   *
   * 关键点：刚「锁上」的那一刻窗口会立刻变成穿透，
   * 但鼠标还停在工具栏上，此时不把「临时可交互」要回来，
   * 按钮会当场失效、用户再也没法解锁 —— 所以后面要补一次 setInteractive(true)。
   */
  const toggleLock = async () => {
    const next = !locked;
    setLocked(next);
    await window.electron?.desktopLyrics?.setLocked?.(next);
    if (next && toolbarActive) await window.electron?.desktopLyrics?.setInteractive?.(true);
  };

  const activeIndex = useMemo(() => findActiveLineIndex(lines, currentMs), [lines, currentMs]);
  const activeLine = activeIndex >= 0 ? lines[activeIndex] : undefined;
  const nextLine = activeIndex >= 0 ? lines[activeIndex + 1] : undefined;

  const emptyHint = loading ? "歌词加载中…" : hasTrack ? "暂无歌词" : "NWBP · 桌面歌词";

  // 底板 / 文字两块透明度各自独立
  const backgroundAlpha = Math.min(100, Math.max(0, style.backgroundOpacity)) / 100;
  const textAlpha = Math.min(100, Math.max(0, style.textOpacity)) / 100;
  const isImageBackground = style.backgroundMode === "image" && Boolean(backgroundImageUrl);
  // 透明模式、或者不透明度为 0 时，底板整层都不生成
  const showBackground = style.backgroundMode !== "transparent" && backgroundAlpha > 0;
  const blurPx = Math.max(0, style.backgroundImageBlur) || 0;

  return (
    <div
      className="flex h-screen w-screen items-center justify-center overflow-hidden select-none"
      style={{ fontFamily }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      {/*
        底板层：尺寸 = 窗口，圆角用窗口圆角变量。
        当前模式用不上这一层时整层不生成 —— 不是把颜色设成全透明，
        免得圆角裁剪在大字边缘切出一点点瑕疵。
      */}
      {showBackground && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ borderRadius: "var(--window-radius)" }}
        >
          {isImageBackground ? (
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url("${backgroundImageUrl}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                opacity: backgroundAlpha,
                // 模糊会把边缘糊开，稍微放大一点免得四边露底
                filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
                transform: blurPx > 0 ? "scale(1.08)" : undefined,
              }}
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: withAlpha(style.backgroundColor, backgroundAlpha) }}
            />
          )}
        </div>
      )}

      {/*
        文字层：整块填满窗口。这样拖拽、边缘缩放、右键命中区都和窗口一致，
        不会出现「看不见但挡住了桌面」的空白区域。
      */}
      <div
        className="relative flex h-full w-full flex-col items-center justify-center gap-1 px-8 py-3"
        style={DRAG_STYLE}
      >
        {/*
          频谱条：位置在歌词正上方。
          做成 flex 子项而不是绝对定位 —— 窗口只有 160px 高，绝对定位很容易压住第一行歌词；
          放进这一列让「频谱 + 歌词」整体居中，天然不会重叠。

          暂停时直接用空数组把柱子收回基准行：主窗口那边虽然也会补一帧全 0，
          但它的定时器一旦被冻住就补不出来了，不能只依赖它。
        */}
        {style.spectrum ? (
          <DesktopLyricsSpectrum bars={isPlaying ? bars : EMPTY_BARS} color={style.color} opacity={textAlpha} />
        ) : null}

        {activeLine ? (
          /*
           * key 跟着行号走：换行时整块重挂一次，触发 .lyric-line-in 的淡入上浮。
           *
           * 注意：**「文字透明度」不能加在这一层上**。
           * .lyric-line-in 的动画带 fill-mode: both，结束态是 opacity: 1，
           * 而 CSS 动画的优先级高于内联样式 —— 写在这层的 opacity 会被动画吃掉。
           * 所以透明度分别加在里面的每一行文字上（下层乘上层，效果一样）。
           */
          <div key={activeIndex} className="lyric-line-in flex w-full flex-col items-center gap-1">
            {/*
              整行一次性显示，**不做逐字填充进度**。
              那条逐字高亮（Apple Music 那种「从左往右填」）在桌面歌词上观感很差：
              未唱到的字只有 42% 不透明度，而这个窗口本来就压在壁纸/视频上、文字还带阴影，
              叠出来就是一片发黑的字，很刺眼。全屏播放器那边背景更干净，保留着没动
              （实现仍在 common/utils/lyrics-render.ts）。
            */}
            <div
              className="w-full text-center leading-snug font-bold break-words whitespace-pre-wrap"
              style={{ fontSize: style.fontSize, color: style.color, opacity: textAlpha, textShadow: TEXT_SHADOW }}
            >
              {activeLine.text}
            </div>

            {style.showRomanization && activeLine.romanization ? (
              <div
                className="w-full text-center break-words whitespace-pre-wrap"
                style={{
                  fontSize: Math.max(12, style.fontSize * 0.44),
                  color: style.color,
                  opacity: 0.72 * textAlpha,
                  textShadow: TEXT_SHADOW,
                }}
              >
                {activeLine.romanization}
              </div>
            ) : null}

            {style.showTranslation && activeLine.translation ? (
              <div
                className="w-full text-center break-words whitespace-pre-wrap"
                style={{
                  fontSize: Math.max(12, style.fontSize * 0.46),
                  color: style.color,
                  opacity: 0.86 * textAlpha,
                  textShadow: TEXT_SHADOW,
                }}
              >
                {activeLine.translation}
              </div>
            ) : null}

            {nextLine ? (
              <div
                className="w-full truncate text-center"
                style={{
                  fontSize: Math.max(11, style.fontSize * 0.42),
                  color: style.color,
                  opacity: 0.42 * textAlpha,
                  textShadow: TEXT_SHADOW,
                }}
              >
                {nextLine.text}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className="text-center"
            style={{
              fontSize: Math.max(13, style.fontSize * 0.5),
              color: style.color,
              opacity: 0.55 * textAlpha,
              textShadow: TEXT_SHADOW,
            }}
          >
            {emptyHint}
          </div>
        )}

        {/* 悬停工具栏：只在右上角出现，避免平时挡住歌词 */}
        <div
          className={clsx(
            "absolute top-1.5 right-2 flex items-center gap-1 rounded-full bg-black/35 px-1 py-0.5 backdrop-blur-md transition-opacity duration-200",
            toolbarActive ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          style={NO_DRAG_STYLE}
        >
          <button
            type="button"
            title={locked ? "解锁（当前鼠标穿透）" : "锁定（鼠标穿透）"}
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
            onClick={() => void toggleLock()}
          >
            {locked ? <RiLockLine size={14} /> : <RiLockUnlockLine size={14} />}
          </button>
          <button
            type="button"
            title="关闭桌面歌词"
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
            onClick={() => void window.electron?.desktopLyrics?.close()}
          >
            <RiCloseLine size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DesktopLyrics;
