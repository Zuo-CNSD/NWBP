import { useCallback, useEffect, useRef, useState } from "react";

import { useDisclosure } from "@heroui/react";
import { RiTBoxLine } from "@remixicon/react";
import clsx from "classnames";

import { findActiveLineIndex, useSmoothProgress, wordFillStyle } from "@/common/utils/lyrics-render";
import { useLyrics } from "@/store/lyrics";
import { usePlayList } from "@/store/play-list";
import { usePlayProgress } from "@/store/play-progress";

import IconButton from "../icon-button";
import LyricsSearchModal from "../lyrics-search-modal";
import FontSizeControl from "./font-size-control";
import OffsetControl from "./offset-control";

/** 歌词横向对齐：贴左 / 居中铺满 / 贴右 */
export type LyricsAlign = "left" | "center" | "right";

const alignedToCenter = (align?: LyricsAlign) => align === "center";
const alignedToRight = (align?: LyricsAlign) => align === "right";

const activeTextBase = "text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.35)]";

const Lyrics = ({ color, align, showControls }: { color?: string; align?: LyricsAlign; showControls?: boolean }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [centerPadding, setCenterPadding] = useState(0);

  const isPlaying = usePlayList(s => s.isPlaying);
  const { currentTime } = usePlayProgress();

  const lines = useLyrics(s => s.lines);
  const offset = useLyrics(s => s.offset);
  const fontSize = useLyrics(s => s.fontSize);
  const isLoading = useLyrics(s => s.isLoading);
  const setOffset = useLyrics(s => s.setOffset);
  const setFontSize = useLyrics(s => s.setFontSize);
  const adopt = useLyrics(s => s.adopt);

  const {
    isOpen: isSearchOpen,
    onOpen: onOpenSearch,
    onClose: onCloseSearch,
    onOpenChange: setIsSearchOpen,
  } = useDisclosure();

  const currentMs = currentTime * 1000 + offset;
  const activeIndex = findActiveLineIndex(lines, currentMs);
  const activeLine = activeIndex >= 0 ? lines[activeIndex] : undefined;
  const smoothMs = useSmoothProgress(currentMs, isPlaying && Boolean(activeLine?.words?.length));

  const updateCenterPadding = useCallback(() => {
    if (activeIndex < 0) {
      setCenterPadding(0);
      return;
    }

    const measure = () => {
      const containerHeight = containerRef.current?.clientHeight ?? 0;
      const lineHeight = lineRefs.current[activeIndex]?.clientHeight ?? 0;
      if (containerHeight > 0 && lineHeight > 0) {
        setCenterPadding(Math.max(0, containerHeight / 2 - lineHeight / 2));
        return true;
      }
      return false;
    };

    if (!measure()) {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        void measure();
      });
    }
  }, [activeIndex]);

  useEffect(() => {
    updateCenterPadding();
  }, [updateCenterPadding, fontSize, lines.length]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [activeIndex]);

  useEffect(() => {
    const handleResize = () => updateCenterPadding();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateCenterPadding]);

  useEffect(() => {
    const wrapper = containerRef.current;
    if (activeIndex < 0) return;

    const el = lineRefs.current[activeIndex];
    if (el && wrapper) {
      const top = el.offsetTop - wrapper.clientHeight / 2 + el.clientHeight / 2;
      wrapper.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
  }, [activeIndex, centerPadding]);

  const handleLyricsAdopted = useCallback(
    (nextLyrics?: string, nextTLyrics?: string) => {
      onCloseSearch();
      if (nextLyrics) adopt(nextLyrics, nextTLyrics);
    },
    [adopt, onCloseSearch],
  );

  const renderLine = (line: LyricSyncedLine, index: number) => {
    const isActive = index === activeIndex;
    const hasWords = Boolean(line.words?.length);

    return (
      <div
        key={`${line.timeMs}-${index}`}
        ref={node => {
          lineRefs.current[index] = node;
        }}
        className={clsx(
          "w-full transform-none py-2 transition-all duration-300 ease-out",
          alignedToCenter(align) ? "text-center" : alignedToRight(align) ? "text-right" : "text-left",
          isActive ? "opacity-100" : "opacity-60",
        )}
        style={{ fontSize: isActive ? fontSize * 1.4 : fontSize, transform: "none" }}
      >
        <div
          className={clsx(
            "leading-snug break-words whitespace-pre-wrap",
            isActive ? "font-extrabold" : "font-normal",
            isActive && activeTextBase,
          )}
          style={{ color }}
        >
          {hasWords && isActive
            ? line.words!.map((word, wordIndex) => (
                <span
                  key={`${word.startMs}-${wordIndex}`}
                  style={wordFillStyle(word.startMs, word.durationMs, smoothMs, color)}
                >
                  {word.text}
                </span>
              ))
            : line.text}
        </div>

        {line.romanization ? (
          <div className="mt-0.5 text-[0.8em] break-words whitespace-pre-wrap text-white/70">{line.romanization}</div>
        ) : null}

        {line.translation ? (
          <div className="mt-1 text-[0.8em] break-words whitespace-pre-wrap text-white/80">{line.translation}</div>
        ) : null}
      </div>
    );
  };

  const fadeMask =
    "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.15) 6%, rgba(0,0,0,0.5) 12%, black 24%, black 76%, rgba(0,0,0,0.5) 88%, rgba(0,0,0,0.15) 94%, transparent 100%)";

  return (
    <>
      <div className="group/lyrics relative flex h-full w-full items-center justify-center overflow-hidden">
        <div
          ref={containerRef}
          className={clsx(
            "no-scrollbar relative h-full w-full max-w-4xl overflow-y-auto",
            // 字号/偏移/搜索这排控件浮在歌词右下角，
            // 在右边留一条不落字的带，否则靠右时贴边的长句会被控件压住。
            // 居中时左右留等宽，文字中心才不会被这条带带偏。
            alignedToCenter(align) ? "px-16" : "pr-16",
          )}
          style={{ WebkitMaskImage: fadeMask, maskImage: fadeMask }}
        >
          {lines.length ? (
            <div className="space-y-2" style={{ paddingTop: centerPadding, paddingBottom: centerPadding }}>
              {lines.map((line, index) => renderLine(line, index))}
            </div>
          ) : (
            <div className="text-foreground/70 flex h-full items-center justify-center">
              {isLoading ? "歌词加载中..." : "暂无歌词"}
            </div>
          )}
        </div>

        {showControls && (
          <div className="text-foreground/80 pointer-events-none absolute right-6 bottom-6 flex flex-col items-center space-y-3 text-sm transition-opacity duration-200">
            <div className="pointer-events-auto">
              <FontSizeControl value={fontSize} onChange={setFontSize} onOpenChange={() => {}} />
            </div>
            <div className="pointer-events-auto">
              <OffsetControl value={offset} onChange={setOffset} onOpenChange={() => {}} />
            </div>
            <div className="pointer-events-auto">
              <IconButton
                type="button"
                onPress={onOpenSearch}
                className="bg-foreground/20 text-foreground hover:bg-foreground/30 min-w-0 rounded-full text-xs font-semibold"
              >
                <RiTBoxLine size={16} />
              </IconButton>
            </div>
          </div>
        )}
      </div>
      <LyricsSearchModal isOpen={isSearchOpen} onOpenChange={setIsSearchOpen} onLyricsAdopted={handleLyricsAdopted} />
    </>
  );
};

export default Lyrics;
