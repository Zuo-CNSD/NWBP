import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { UpdateCheckResult } from "@shared/update";

/**
 * 更新检查与公告的界面状态。
 *
 * **不在这里做网络请求的排队/去重** —— 主进程那边已经有 30 分钟缓存，
 * 这里只管「检查中 / 结果 / 已读公告」这几件事。
 *
 * 持久化的只有两样：`autoCheck`（用户的偏好）和 `readAnnouncements`（已读过哪些公告）。
 * 检查结果本身不持久化：重启后应该重新查一次，而不是拿旧结果骗用户「已是最新」。
 */
interface UpdateState {
  /** 最近一次检查结果 */
  result?: UpdateCheckResult;
  checking: boolean;
  /** 启动时自动检查 */
  autoCheck: boolean;
  /** 已读公告的 id */
  readAnnouncements: string[];
  check: (force?: boolean) => Promise<UpdateCheckResult | undefined>;
  markAnnouncementsRead: (ids: string[]) => void;
  setAutoCheck: (value: boolean) => void;
}

export const useUpdateStore = create<UpdateState>()(
  persist(
    (set, get) => ({
      checking: false,
      autoCheck: true,
      readAnnouncements: [],
      check: async force => {
        if (get().checking) return get().result;
        set({ checking: true });
        try {
          const result = await window.electron.checkUpdate(force);
          set({ result, checking: false });
          return result;
        } catch (error) {
          set({ checking: false });
          throw error;
        }
      },
      markAnnouncementsRead: ids => {
        if (!ids.length) return;
        set(state => ({
          readAnnouncements: Array.from(new Set([...state.readAnnouncements, ...ids])),
        }));
      },
      setAutoCheck: value => set({ autoCheck: value }),
    }),
    {
      name: "update-store",
      partialize: state => ({
        autoCheck: state.autoCheck,
        readAnnouncements: state.readAnnouncements,
      }),
    },
  ),
);

/** 未读公告（按 id 过滤）。没有 result 时返回空数组。 */
export const selectUnreadAnnouncements = (state: UpdateState) => {
  const all = state.result?.announcements ?? [];
  return all.filter(item => !state.readAnnouncements.includes(item.id));
};
