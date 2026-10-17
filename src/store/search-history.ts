import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SearchItem {
  value: string;
  time: number;
}

export interface SearchHistoryState {
  keyword: string;
  items: SearchItem[];
}

export interface SearchHistoryAction {
  add: (value: string) => void;
  delete: (item: SearchItem) => void;
  clear: () => void;
}

export const useSearchHistory = create<SearchHistoryState & SearchHistoryAction>()(
  persist(
    (set, get) => ({
      keyword: "",
      items: [],
      add: value => {
        const { items } = get();
        const newItem = { value, time: Date.now() };

        if (items.some(i => i.value === value)) {
          set({ keyword: value, items: [newItem, ...items.filter(i => i.value !== value)] });
        } else {
          set({ keyword: value, items: [newItem, ...items] });
        }
      },
      delete: item => set(state => ({ items: state.items.filter(i => i.value !== item.value) })),
      clear: () => set({ keyword: "", items: [] }),
    }),
    {
      name: "search-history",
      // keyword 只在**当前会话内**有意义，不进 localStorage ——
      // 否则下次启动搜索框会被上次搜的词预填，还得手动清。
      // v0 的老数据里带着 keyword，靠 migrate 丢掉。
      version: 1,
      partialize: state => ({ items: state.items }),
      migrate: (persisted, version) =>
        version < 1
          ? { items: (persisted as { items?: SearchItem[] } | undefined)?.items ?? [] }
          : (persisted as { items: SearchItem[] }),
    },
  ),
);
