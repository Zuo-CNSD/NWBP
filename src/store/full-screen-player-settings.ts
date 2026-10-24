import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 纯色模式的兜底背景色 —— 见 resolveBackgroundColor 的说明 */
export const DEFAULT_BACKGROUND_COLOR = "#101014";

/** 全屏播放器的背景来源 */
export type FullScreenBackgroundMode = "blur" | "custom" | "color";

/** 歌词横向位置 */
export type LyricsPositionH = "left" | "center" | "right";
/** 歌词纵向位置 */
export type LyricsPositionV = "top" | "center" | "bottom";

export interface FullScreenPlayerSettingsState {
  showLyrics: boolean;
  showSpectrum: boolean;
  showCover: boolean;
  /** @deprecated 旧字段，保留用于兼容历史配置；新逻辑请用 backgroundMode */
  showBlurredBackground: boolean;
  /** 背景来源：blur=虚化封面 / custom=自定义背景 / color=纯色 */
  backgroundMode?: FullScreenBackgroundMode;
  /** 歌词横向位置 */
  lyricsPositionH?: LyricsPositionH;
  /** 歌词纵向位置 */
  lyricsPositionV?: LyricsPositionV;
  backgroundColor?: string;
  spectrumColor?: string;
  lyricsColor?: string;
}

interface Actions {
  update: (patch: Partial<FullScreenPlayerSettingsState>) => void;
  reset: () => void;
}

const defaultSettings: FullScreenPlayerSettingsState = {
  showLyrics: true,
  showSpectrum: false,
  showCover: true,
  showBlurredBackground: true,
  // 默认留空而不是写死 "blur"：这样老用户以前关掉过虚化背景的配置
  // 仍然会解析成 "color"，不会被这次改动改掉行为
  backgroundMode: undefined,
  // 同样留空：没选过时按"有封面就靠右、没封面就居中"推导，保持原观感
  lyricsPositionH: undefined,
  lyricsPositionV: undefined,
  backgroundColor: DEFAULT_BACKGROUND_COLOR,
  spectrumColor: "currentColor",
  lyricsColor: "#ffffff",
};

/**
 * 解析「纯色」模式的背景色。
 *
 * 这个值以前是 `undefined`，面板上的颜色选择器又没有"未选"这一档，
 * 于是它被顺手写成了 `#ffffff`，而歌词默认色也是白色 ——
 * 谁点「纯色」谁就得到一整屏白底白字，什么都看不见。
 * 纯白在这里一律当成"没选过"，退回深色底。
 */
export const resolveBackgroundColor = (state: Pick<FullScreenPlayerSettingsState, "backgroundColor">): string => {
  const v = state.backgroundColor?.trim().toLowerCase();
  if (!v || v === "#ffffff" || v === "#fff") return DEFAULT_BACKGROUND_COLOR;
  return state.backgroundColor as string;
};

/**
 * 解析出真正生效的背景模式。
 * 没显式选过时，按旧的 showBlurredBackground 推断。
 */
export const resolveBackgroundMode = (
  state: Pick<FullScreenPlayerSettingsState, "backgroundMode" | "showBlurredBackground">,
): FullScreenBackgroundMode => state.backgroundMode ?? (state.showBlurredBackground === false ? "color" : "blur");

/**
 * 解析歌词横向位置。
 * 没显式选过时的默认行为：显示封面时歌词靠右，不显示封面时铺满居中。
 */
export const resolveLyricsPositionH = (
  state: Pick<FullScreenPlayerSettingsState, "lyricsPositionH" | "showCover">,
): LyricsPositionH => state.lyricsPositionH ?? (state.showCover ? "right" : "center");

export const resolveLyricsPositionV = (
  state: Pick<FullScreenPlayerSettingsState, "lyricsPositionV">,
): LyricsPositionV => state.lyricsPositionV ?? "center";

export const useFullScreenPlayerSettings = create<FullScreenPlayerSettingsState & Actions>()(
  persist(
    set => ({
      ...defaultSettings,
      update: patch => set(patch),
      reset: () => set(defaultSettings),
    }),
    {
      name: "full-screen-player-settings",
      partialize: state => ({
        showLyrics: state.showLyrics,
        showSpectrum: state.showSpectrum,
        showCover: state.showCover,
        showBlurredBackground: state.showBlurredBackground,
        backgroundMode: state.backgroundMode,
        lyricsPositionH: state.lyricsPositionH,
        lyricsPositionV: state.lyricsPositionV,
        backgroundColor: state.backgroundColor,
        spectrumColor: state.spectrumColor,
        lyricsColor: state.lyricsColor,
      }),
    },
  ),
);
