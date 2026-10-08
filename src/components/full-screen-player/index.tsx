import { useEffect, useMemo, useRef, useState } from "react";

import { Drawer, DrawerBody, DrawerContent, Image, Popover, PopoverContent, PopoverTrigger } from "@heroui/react";
import { RiArrowDownSLine, RiArrowLeftSLine, RiSettings3Line } from "@remixicon/react";
import { useClickAway } from "ahooks";
import clsx from "classnames";
import { readableColor } from "color2k";
import { useShallow } from "zustand/shallow";

import type { FullScreenBackgroundMode } from "@/store/full-screen-player-settings";

import { Themes } from "@/common/constants/theme";
import { hexToHsl, resolveTheme, isHex } from "@/common/utils/color";
import AudioWaveform from "@/components/audio-waveform";
import Lyrics from "@/components/lyrics";
import { useBackgroundImage } from "@/store/background-image";
import {
  resolveBackgroundMode,
  resolveLyricsPositionH,
  resolveLyricsPositionV,
  useFullScreenPlayerSettings,
} from "@/store/full-screen-player-settings";
import { useModalStore } from "@/store/modal";
import { usePlayList } from "@/store/play-list";
import { useSettings } from "@/store/settings";

import Empty from "../empty";
import IconButton from "../icon-button";
import MusicPlayControl from "../music-play-control";
import MusicPlayMode from "../music-play-mode";
import MusicPlayProgress from "../music-play-progress";
import OpenPlaylistDrawerButton from "../open-playlist-drawer-button";
import WindowAction from "../window-action";
import { useGlassmorphism } from "./glassmorphism";
import PageList from "./page-list";
import FullScreenPlayerSettingsPanel from "./settings-panel";

const platform = window.electron.getPlatform();

const FullScreenPlayer = () => {
  const isOpen = useModalStore(s => s.isFullScreenPlayerOpen);
  const close = useModalStore(s => s.closeFullScreenPlayer);
  const { playId, list } = usePlayList(
    useShallow(state => ({
      playId: state.playId,
      list: state.list,
    })),
  );
  const primaryColor = useSettings(s => s.primaryColor);
  const themeMode = useSettings(s => s.themeMode);
  const {
    showLyrics,
    showSpectrum,
    showCover,
    backgroundMode: rawBackgroundMode,
    lyricsPositionH,
    lyricsPositionV,
    backgroundColor,
    spectrumColor,
    lyricsColor,
  } = useFullScreenPlayerSettings(
    useShallow(s => ({
      showLyrics: s.showLyrics,
      showSpectrum: s.showSpectrum,
      showCover: s.showCover,
      backgroundMode: resolveBackgroundMode(s),
      lyricsPositionH: resolveLyricsPositionH(s),
      lyricsPositionV: resolveLyricsPositionV(s),
      backgroundColor: s.backgroundColor,
      spectrumColor: s.spectrumColor,
      lyricsColor: s.lyricsColor,
    })),
  );

  // 设置里选了自定义背景图时才能用「自定义背景」模式
  const customBackgroundUrl = useBackgroundImage(s => s.url);
  const { backgroundImageBlur, backgroundImageDim } = useSettings(
    useShallow(s => ({
      backgroundImageBlur: s.backgroundImageBlur,
      backgroundImageDim: s.backgroundImageDim,
    })),
  );
  // 选的是自定义背景但没设图时，退回纯色，避免全屏变白板
  const backgroundMode: FullScreenBackgroundMode =
    rawBackgroundMode === "custom" && !customBackgroundUrl ? "color" : rawBackgroundMode;
  const isBlurredBackground = backgroundMode === "blur";

  const playItem = list.find(item => item.id === playId);
  const isLocal = playItem?.source === "local";

  /*
   * 歌词位置。
   * - 居中：歌词铺满整屏，封面就不占位了（否则两块会挤在一起）
   * - 靠左：歌词占左半区、文字贴左；封面贴到屏幕最右边
   * - 靠右：封面贴到屏幕最左边；歌词占右半区、文字贴右
   * 「靠左 / 靠右」是一对镜像 —— 歌词贴住选中的那一侧，
   * 封面去对面那一侧的最外沿，两块内容分列屏幕两边。
   * 用 order 而不是 flex-row-reverse：反向主轴会让 justify-end 的语义跟着翻转，容易搞错。
   */
  const isLyricsCentered = lyricsPositionH === "center";
  const showCoverBlock = !isLocal && showCover && !(showLyrics && isLyricsCentered);
  const lyricsFirst = showLyrics && lyricsPositionH === "left";
  // 歌词在左半区 → 封面靠最右；歌词在右半区 → 封面靠最左；没有歌词 → 居中
  const coverJustify = !showLyrics ? "justify-center" : lyricsFirst ? "justify-end" : "justify-start";

  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1000);
  const [windowHeight, setWindowHeight] = useState(typeof window !== "undefined" ? window.innerHeight : 800);
  const [isPageListOpen, setIsPageListOpen] = useState(false);
  const [isUiVisible, setIsUiVisible] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [controlsHeight, setControlsHeight] = useState(80);

  const pageListRef = useRef<HTMLDivElement>(null);
  const hideUiTimeoutRef = useRef<number | null>(null);

  useClickAway(() => {
    if (isPageListOpen) {
      setIsPageListOpen(false);
    }
  }, pageListRef);

  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // Initial check
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (hideUiTimeoutRef.current) {
        window.clearTimeout(hideUiTimeoutRef.current);
        hideUiTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsUiVisible(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isUiVisible && isSettingsOpen) {
      setIsSettingsOpen(false);
    }
  }, [isUiVisible, isSettingsOpen]);

  const handleMouseEnter = () => {
    if (hideUiTimeoutRef.current) {
      window.clearTimeout(hideUiTimeoutRef.current);
      hideUiTimeoutRef.current = null;
    }
    if (!isUiVisible) {
      setIsUiVisible(true);
    }
  };

  const scheduleHideUi = (delay: number) => {
    if (isSettingsOpen) return;
    if (hideUiTimeoutRef.current) {
      window.clearTimeout(hideUiTimeoutRef.current);
    }
    hideUiTimeoutRef.current = window.setTimeout(() => {
      setIsUiVisible(false);
    }, delay);
  };

  const handleMouseLeave = () => {
    scheduleHideUi(3000);
  };

  const coverSrc = playItem?.pageCover || playItem?.cover;
  const { effectsProfile, bgLayerA, bgLayerB, activeBgLayer, cssVars } = useGlassmorphism(
    coverSrc,
    primaryColor,
    isOpen,
  );

  useEffect(() => {
    const updateHeight = () => {
      const el = controlsRef.current;
      if (el) {
        setControlsHeight(el.offsetHeight || 80);
      }
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  useEffect(() => {
    const el = controlsRef.current;
    if (el) {
      setControlsHeight(el.offsetHeight || 80);
    }
  }, [isUiVisible]);

  const computedForegroundHex = useMemo(() => {
    // 虚化封面和自定义背景的明暗都不确定，这里不接管前景色，交给主题和用户的文字颜色设置
    if (backgroundMode !== "color") return undefined;
    const baseBg =
      backgroundColor && isHex(backgroundColor) ? backgroundColor : Themes[resolveTheme(themeMode)].colors!.background;
    try {
      return readableColor(baseBg as string);
    } catch {
      return undefined;
    }
  }, [backgroundColor, themeMode, backgroundMode]);

  const themeVars = useMemo(() => {
    const vars: React.CSSProperties = {
      ...cssVars,
      ["--heroui-primary" as any]: hexToHsl(primaryColor),
    };
    if (computedForegroundHex) {
      vars["--heroui-foreground" as any] = hexToHsl(computedForegroundHex);
    }
    return vars;
  }, [cssVars, primaryColor, computedForegroundHex]);

  const appTheme = useMemo(() => resolveTheme(themeMode), [themeMode]);

  if (!playItem) return null;

  const coverWidth = Math.max(260, Math.min(windowWidth * 0.7, windowHeight * 0.48, 520));
  const coverHeight = coverWidth * 0.75;
  const waveformWidth = Math.min(640, Math.max(400, Math.round(windowWidth * 0.5)));
  const waveformBarCount = Math.max(48, Math.min(128, Math.round(waveformWidth / 7.5)));

  return (
    <Drawer
      isOpen={isOpen}
      onClose={close}
      placement="bottom"
      size="full"
      radius="none"
      isDismissable={false}
      hideCloseButton
    >
      <DrawerContent
        className={clsx("bg-background text-foreground relative h-full overflow-hidden", {
          dark: isBlurredBackground || appTheme === "dark",
          light: !isBlurredBackground && appTheme === "light",
        })}
        style={{
          ...themeVars,
          cursor: isUiVisible ? "auto" : "none",
        }}
      >
        {onClose =>
          !isOpen ? (
            <Empty />
          ) : (
            <DrawerBody
              className="group/player relative flex flex-row gap-0 overflow-hidden bg-transparent p-0"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onMouseMove={() => {
                if (!isUiVisible) {
                  setIsUiVisible(true);
                }
                scheduleHideUi(3000);
              }}
            >
              {backgroundMode === "color" && (
                <div aria-hidden className="absolute inset-0 -z-10" style={{ backgroundColor: backgroundColor }} />
              )}
              {backgroundMode === "custom" && customBackgroundUrl && (
                <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                      backgroundImage: `url("${customBackgroundUrl}")`,
                      filter: `blur(${backgroundImageBlur}px)`,
                      transform: `scale(${1 + backgroundImageBlur / 900})`,
                    }}
                  />
                  {/* 压暗遮罩 + 上下渐隐，保证歌词和控制条在任意背景图下都看得清 */}
                  <div className="absolute inset-0" style={{ background: `hsl(0 0% 0% / ${backgroundImageDim})` }} />
                  <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/45 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/55 to-transparent" />
                </div>
              )}
              {isBlurredBackground && (
                <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      opacity: activeBgLayer === "a" ? 1 : 0,
                      transition: `opacity ${effectsProfile.transitionMs}ms ease`,
                      willChange: "opacity",
                    }}
                  >
                    {bgLayerA.coverSrc && (
                      <div
                        className="absolute inset-0 scale-[1.15] bg-cover bg-center"
                        style={{
                          backgroundImage: `url(${bgLayerA.coverSrc})`,
                          filter: `blur(${effectsProfile.blurPx}px)`,
                          opacity: 0.92,
                          willChange: "transform, filter, opacity",
                          transition: `filter ${effectsProfile.transitionMs}ms ease, opacity ${effectsProfile.transitionMs}ms ease`,
                        }}
                      />
                    )}
                    <div
                      className="absolute inset-0"
                      style={{
                        background: bgLayerA.gradientBackground,
                        willChange: "opacity",
                      }}
                    />
                  </div>
                  <div
                    className="absolute inset-0"
                    style={{
                      opacity: activeBgLayer === "b" ? 1 : 0,
                      transition: `opacity ${effectsProfile.transitionMs}ms ease`,
                      willChange: "opacity",
                    }}
                  >
                    {bgLayerB.coverSrc && (
                      <div
                        className="absolute inset-0 scale-[1.15] bg-cover bg-center"
                        style={{
                          backgroundImage: `url(${bgLayerB.coverSrc})`,
                          filter: `blur(${effectsProfile.blurPx}px)`,
                          opacity: 0.92,
                          willChange: "transform, filter, opacity",
                          transition: `filter ${effectsProfile.transitionMs}ms ease, opacity ${effectsProfile.transitionMs}ms ease`,
                        }}
                      />
                    )}
                    <div
                      className="absolute inset-0"
                      style={{
                        background: bgLayerB.gradientBackground,
                        willChange: "opacity",
                      }}
                    />
                  </div>
                </div>
              )}
              <div
                className={`absolute top-0 right-0 z-20 flex w-full justify-between px-6 py-4 transition-opacity duration-200 ${isUiVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
              >
                <div className="window-no-drag top-0 right-0 left-0 flex w-full max-w-2/5 items-center space-x-2">
                  <IconButton title="关闭弹窗" onPress={onClose} className="">
                    <RiArrowDownSLine size={28} />
                  </IconButton>
                  <h2 className="truncate text-xl select-none">{playItem.pageTitle || playItem.title}</h2>
                  <Popover
                    isOpen={isSettingsOpen && isUiVisible}
                    onOpenChange={open => {
                      setIsSettingsOpen(open);
                      if (open) {
                        if (hideUiTimeoutRef.current) {
                          window.clearTimeout(hideUiTimeoutRef.current);
                          hideUiTimeoutRef.current = null;
                        }
                        setIsUiVisible(true);
                      }
                    }}
                    placement="bottom-start"
                  >
                    <PopoverTrigger>
                      <IconButton title="设置" tooltip="设置">
                        <RiSettings3Line size={22} />
                      </IconButton>
                    </PopoverTrigger>
                    <PopoverContent className="p-4">
                      <FullScreenPlayerSettingsPanel isUiVisible={isUiVisible} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="window-no-drag top-0 right-0">
                  {platform === "linux" || platform === "windows" ? <WindowAction /> : null}
                </div>
              </div>

              <div className="flex h-full w-full items-center justify-center">
                {showCoverBlock && (
                  <div
                    className={clsx(
                      "flex h-full w-full items-center px-12",
                      coverJustify,
                      lyricsFirst ? "order-2" : "order-1",
                    )}
                  >
                    <Image
                      src={coverSrc}
                      radius="lg"
                      className="transition-shadow ease-out"
                      classNames={{
                        wrapper: "pointer-events-none",
                        img: "w-full h-full object-cover select-none pointer-events-none",
                      }}
                      style={{
                        width: coverWidth,
                        height: coverHeight,
                        boxShadow: `0 28px 90px -35px rgb(var(--glow-rgb) / 0.55), 0 10px 32px -18px rgb(0 0 0 / 0.55)`,
                        transition: `box-shadow ${effectsProfile.transitionMs}ms ease`,
                        aspectRatio: "4 / 3",
                      }}
                    />
                  </div>
                )}

                {!isLocal && showLyrics && (
                  <div
                    className={clsx(
                      "flex h-full w-full flex-col overflow-hidden px-12",
                      lyricsFirst ? "order-1" : "order-2",
                      // 纵向位置：靠上/靠下时把歌词区压缩到 58% 高度，位置差异才看得出来
                      lyricsPositionV === "top" && "justify-start pt-16 pb-40",
                      lyricsPositionV === "center" && "justify-center py-24",
                      lyricsPositionV === "bottom" && "justify-end pt-40 pb-32",
                    )}
                  >
                    <div className={clsx("w-full", lyricsPositionV === "center" ? "h-full" : "h-[58%]")}>
                      <Lyrics color={lyricsColor} align={lyricsPositionH} showControls={isUiVisible} />
                    </div>
                  </div>
                )}
              </div>

              {showSpectrum && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-30 flex w-full justify-center"
                  style={{
                    bottom: isUiVisible ? controlsHeight + 12 : 24,
                    transition: "bottom 300ms ease",
                  }}
                >
                  <div className="mx-auto flex w-full max-w-6xl justify-center px-12">
                    <AudioWaveform
                      width={waveformWidth}
                      height={40}
                      barCount={waveformBarCount}
                      barColor={spectrumColor || "currentColor"}
                    />
                  </div>
                </div>
              )}

              <div
                ref={controlsRef}
                className={clsx(
                  "absolute inset-x-0 bottom-0 z-40 transform transition-transform duration-300 ease-out",
                  isUiVisible
                    ? "pointer-events-auto translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-full opacity-0",
                )}
              >
                <div className="mx-auto mb-4 flex w-full max-w-6xl flex-col items-center gap-2 px-12">
                  <MusicPlayProgress className="w-full" trackClassName="h-[6px]" />
                  <div className="flex w-full items-center justify-center space-x-4">
                    <MusicPlayMode />
                    <MusicPlayControl />
                    <OpenPlaylistDrawerButton />
                  </div>
                </div>
              </div>

              {isUiVisible && playItem.hasMultiPart && !isPageListOpen && (
                <div className="absolute top-1/2 right-0 z-20 -translate-y-1/2">
                  <IconButton
                    className="h-24 w-6 min-w-0 rounded-l-xl rounded-r-none bg-white/10 px-0 backdrop-blur-md transition-colors hover:bg-white/20"
                    onPress={() => setIsPageListOpen(!isPageListOpen)}
                    tooltip="显示分集列表"
                    tooltipProps={{
                      placement: "left",
                    }}
                  >
                    <RiArrowLeftSLine size={24} className="text-white/80" />
                  </IconButton>
                </div>
              )}

              <PageList
                ref={pageListRef}
                className={`absolute top-1/2 right-0 z-30 -translate-y-1/2 rounded-r-none transition-all duration-300 ease-out ${
                  isPageListOpen ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-full opacity-0"
                }`}
                style={{
                  width: 280,
                  height: "min(60vh, 420px)",
                }}
                onClose={() => setIsPageListOpen(false)}
              />
            </DrawerBody>
          )
        }
      </DrawerContent>
    </Drawer>
  );
};

export default FullScreenPlayer;
