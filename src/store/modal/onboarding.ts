import { create } from "zustand";

/**
 * 新手引导的显隐。
 *
 * 和 `full-screen-player` 那套一致，用全局 store 而不是路由 ——
 * 引导是盖在当前页面上的一层，关掉之后用户应该还在原来的页面。
 *
 * 「是否看过」不在这里，持久化在 `AppSettings.onboardingDone`：
 * 这里只放本次运行期的开关，免得把 UI 状态写进配置文件。
 */
interface State {
  isOnboardingOpen: boolean;
  open: VoidFunction;
  close: VoidFunction;
}

export const useOnboardingStore = create<State>(set => ({
  isOnboardingOpen: false,
  open: () => set({ isOnboardingOpen: true }),
  close: () => set({ isOnboardingOpen: false }),
}));
