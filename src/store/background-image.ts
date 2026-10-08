import { create } from "zustand";

/**
 * 已解析好的自定义背景图（data URL）。
 *
 * 背景图的读取在 Theme 里做一次（见 components/theme），
 * 这里只是把结果共享出来，让全屏播放器之类的组件也能用上，
 * 避免各自去读文件。为空表示用户没有设置自定义背景图。
 */
interface BackgroundImageState {
  url: string;
  setUrl: (url: string) => void;
}

export const useBackgroundImage = create<BackgroundImageState>(set => ({
  url: "",
  setUrl: url => set({ url }),
}));
