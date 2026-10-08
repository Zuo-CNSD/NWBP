import { debounce } from "es-toolkit";
import { create } from "zustand";

import { resolveLyricsForCurrentTrack, type ResolvedLyrics } from "@/service/lyrics-resolve";
import { normalizeLyrics } from "@shared/lyrics/normalize";
import { parseLyrics } from "@shared/lyrics/parse";
import { StoreNameMap } from "@shared/store";

import { usePlayList } from "./play-list";

/**
 * 歌词状态。
 *
 * 为什么从歌词组件里抽出来：**桌面歌词窗和全屏播放器用的是同一份歌词**。
 * 原来解析逻辑挂在「全屏播放器里的歌词组件」上，只有用户点开全屏才会解析 ——
 * 那样桌面歌词在主界面上就永远是空的。
 * 抽成 store 之后，只要在放歌就解析，两个渲染出口各取所需。
 */

export const DEFAULT_LYRICS_FONT_SIZE = 20;
export const DEFAULT_LYRICS_OFFSET = 0;

const EMPTY_LYRICS: ResolvedLyrics = {
  lyrics: "",
  wordLyrics: "",
  tLyrics: "",
  romanization: "",
  source: "",
  candidateId: "",
};

/** 曲目唯一键：用于缓存与「人工选定来源」记录 */
export const currentLyricsTrackKey = () => {
  const item = usePlayList.getState().getPlayItem();
  if (!item?.bvid || !item.cid) return null;
  return `${item.bvid}-${item.cid}`;
};

const deriveLines = (raw: ResolvedLyrics): LyricSyncedLine[] => {
  if (!raw.lyrics && !raw.wordLyrics) return [];
  const parsed = parseLyrics({
    lrc: raw.lyrics,
    yrc: raw.wordLyrics,
    translation: raw.tLyrics,
    romanization: raw.romanization,
  });
  return normalizeLyrics(parsed).lines;
};

interface LyricsState {
  trackKey: string | null;
  raw: ResolvedLyrics;
  lines: LyricSyncedLine[];
  offset: number;
  fontSize: number;
  isLoading: boolean;
}

interface LyricsActions {
  /** 为当前曲目解析歌词；force 时忽略缓存重新联网 */
  load: (options?: { force?: boolean }) => Promise<void>;
  setOffset: (value: number) => void;
  setFontSize: (value: number) => void;
  /** 用户在搜索弹窗里手选了一份歌词 */
  adopt: (lyrics: string, tLyrics?: string) => void;
  reset: () => void;
}

/** 写缓存：把原文、逐字、翻译、罗马音、偏移、字号一起存下来，重放时不用再联网 */
const persistCache = debounce(async (trackKey: string, patch: Partial<MusicLyrics> & Partial<ResolvedLyrics>) => {
  try {
    const store = (await window.electron.getStore(StoreNameMap.LyricsCache)) ?? {};
    const prev = store[trackKey] ?? {};

    await window.electron.setStore(StoreNameMap.LyricsCache, {
      ...store,
      [trackKey]: {
        ...prev,
        offset: patch.offset ?? prev.offset,
        fontSize: patch.fontSize ?? prev.fontSize,
        ...(patch.lyrics !== undefined
          ? {
              lyrics: patch.lyrics,
              wordLyrics: patch.wordLyrics,
              tLyrics: patch.tLyrics,
              romanization: patch.romanization,
              source: patch.source,
              candidateId: patch.candidateId,
            }
          : {}),
      } satisfies MusicLyrics,
    });
  } catch {
    // 缓存写失败不影响播放，静默即可
  }
}, 500);

export const useLyrics = create<LyricsState & LyricsActions>((set, get) => ({
  trackKey: null,
  raw: EMPTY_LYRICS,
  lines: [],
  offset: DEFAULT_LYRICS_OFFSET,
  fontSize: DEFAULT_LYRICS_FONT_SIZE,
  isLoading: false,

  reset: () =>
    set({
      trackKey: null,
      raw: EMPTY_LYRICS,
      lines: [],
      offset: DEFAULT_LYRICS_OFFSET,
      fontSize: DEFAULT_LYRICS_FONT_SIZE,
      isLoading: false,
    }),

  load: async options => {
    const trackKey = currentLyricsTrackKey();
    if (!trackKey) {
      set({ trackKey: null, raw: EMPTY_LYRICS, lines: [], isLoading: false });
      return;
    }

    set({ trackKey, isLoading: true });

    try {
      // 1) 缓存优先
      if (!options?.force) {
        const store = await window.electron.getStore(StoreNameMap.LyricsCache);
        const cached = store?.[trackKey] as MusicLyrics | undefined;

        if (cached && (cached.lyrics || cached.wordLyrics)) {
          const raw: ResolvedLyrics = {
            lyrics: cached.lyrics ?? "",
            wordLyrics: cached.wordLyrics ?? "",
            tLyrics: cached.tLyrics ?? "",
            romanization: cached.romanization ?? "",
            source: cached.source ?? "",
            candidateId: cached.candidateId ?? "",
          };
          set({
            raw,
            lines: deriveLines(raw),
            offset: typeof cached.offset === "number" ? cached.offset : DEFAULT_LYRICS_OFFSET,
            fontSize: typeof cached.fontSize === "number" ? cached.fontSize : DEFAULT_LYRICS_FONT_SIZE,
            isLoading: false,
          });
          return;
        }
      }

      // 2) 多源聚合（内部已带 B 站兜底）
      const resolved = (await resolveLyricsForCurrentTrack()) ?? EMPTY_LYRICS;

      // 解析期间用户可能已经切歌了，切走了就丢弃这次结果
      if (get().trackKey !== trackKey) return;

      set({
        raw: resolved,
        lines: deriveLines(resolved),
        offset: DEFAULT_LYRICS_OFFSET,
        fontSize: DEFAULT_LYRICS_FONT_SIZE,
        isLoading: false,
      });

      void persistCache(trackKey, {
        ...resolved,
        offset: DEFAULT_LYRICS_OFFSET,
        fontSize: DEFAULT_LYRICS_FONT_SIZE,
      });
    } catch {
      if (get().trackKey === trackKey) set({ raw: EMPTY_LYRICS, lines: [], isLoading: false });
    }
  },

  setOffset: value => {
    set({ offset: value });
    const { trackKey } = get();
    if (trackKey) void persistCache(trackKey, { offset: value });
  },

  setFontSize: value => {
    set({ fontSize: value });
    const { trackKey } = get();
    if (trackKey) void persistCache(trackKey, { fontSize: value });
  },

  adopt: (lyrics, tLyrics) => {
    const raw: ResolvedLyrics = {
      lyrics,
      wordLyrics: "",
      tLyrics: tLyrics ?? "",
      romanization: "",
      source: "manual",
      candidateId: "",
    };
    set({ raw, lines: deriveLines(raw) });

    const { trackKey, offset, fontSize } = get();
    if (trackKey) void persistCache(trackKey, { ...raw, offset, fontSize });
  },
}));
