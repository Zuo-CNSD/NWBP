import { addToast } from "@heroui/react";
import { create } from "zustand";

import { cleanErrorMessage } from "@/common/utils/ipc-error";

import { isNeteaseLoggedIn, useNetease } from "./netease";

/**
 * 网易云「我喜欢的音乐」的收藏状态。
 *
 * 为什么要单独存一份 id 集合：主进程的 `likedIds()` 实际上要
 * 「先找到我自己的那个『我喜欢的音乐』歌单（`specialType === 5` 且不是收藏来的，
 * 见 `shared/netease/playlist.ts`）→ 再拉它的曲目 id」，对上千首的库来说不便宜。
 * 而播放栏的星星和每一行曲目的右键菜单都要查「这首喜欢了吗」，
 * 所以拉一次缓存在渲染端，收藏/取消时本地先改、失败再回滚。
 */
interface State {
  ids: Set<number>;
  /**
   * 这份 `ids` 属于哪个账号。
   *
   * ⚠️ 必须记下来：**两个账号的「我喜欢的音乐」是两个不同的歌单**，
   * 只看 `loaded` 的话换账号后会直接命中缓存，星星全停在上一个账号。
   */
  uid: number | null;
  /** 是否已经成功拉过一次（用来跳过重复请求） */
  loaded: boolean;
  loading: boolean;
}

interface Action {
  has: (id?: number) => boolean;
  /** 拉一次喜欢的曲目集合；已加载过就走缓存，force 可强制刷新 */
  refresh: (options?: { force?: boolean }) => Promise<void>;
  /** 翻转喜欢状态，返回翻转后的结果（true = 现在已收藏） */
  toggle: (id: number, name?: string) => Promise<boolean>;
}

/** 同一时刻只允许一个请求在飞：星星和行菜单会并发触发 */
let inflight: Promise<void> | null = null;

export const useNeteaseLike = create<State & Action>()((set, get) => ({
  ids: new Set<number>(),
  uid: null,
  loaded: false,
  loading: false,

  has: id => (id ? get().ids.has(id) : false),

  refresh: async options => {
    const currentUid = useNetease.getState().account?.uid ?? null;

    if (!isNeteaseLoggedIn() || !currentUid) {
      // 退出登录后把缓存清掉，否则星星会停在上一个账号的状态
      set({ ids: new Set(), uid: null, loaded: false });
      return;
    }

    // 账号变了（缓存是别人的）或者压根没拉过 → 无视缓存重拉
    const stale = get().uid !== currentUid;
    if (get().loaded && !stale && !options?.force) return;
    if (inflight) return inflight;

    set({ loading: true });
    inflight = (async () => {
      try {
        const ids = await window.electron.netease.likedIds();
        set({ ids: new Set(ids ?? []), uid: currentUid, loaded: true });
      } catch {
        // 拉不到就当空集合，别让界面卡在 loading
        set({ ids: new Set(), uid: currentUid, loaded: false });
      } finally {
        set({ loading: false });
        inflight = null;
      }
    })();

    return inflight;
  },

  toggle: async (id, name) => {
    if (!isNeteaseLoggedIn()) {
      addToast({ title: "先登录网易云账号再收藏", color: "warning" });
      return false;
    }

    const next = !get().ids.has(id);

    // 乐观更新：点星星要立刻有反馈，不能等一个来回
    set(state => {
      const ids = new Set(state.ids);
      if (next) ids.add(id);
      else ids.delete(id);
      return { ids, loaded: true };
    });

    try {
      await window.electron.netease.like(id, next);
      addToast({
        title: next ? `已收藏到网易云${name ? `：${name}` : ""}` : "已从网易云取消收藏",
        color: "success",
      });
      return next;
    } catch (error) {
      // 失败回滚，别让界面显示成"收藏成功了"
      set(state => {
        const ids = new Set(state.ids);
        if (next) ids.delete(id);
        else ids.add(id);
        return { ids };
      });
      addToast({ title: cleanErrorMessage(error), color: "danger" });
      return !next;
    }
  },
}));

/**
 * 账号一变就把「我喜欢的音乐」缓存作废、立刻重拉。
 *
 * 不这么做的话，得等到下一次 `track-list` 挂载（`refresh()`）才会发现账号换了 ——
 * 中间这段时间播放栏那颗星星、右键菜单里的「喜欢 / 取消喜欢」全是上一个账号的状态。
 */
useNetease.subscribe((state, prevState) => {
  if ((state.account?.uid ?? null) !== (prevState.account?.uid ?? null)) {
    void useNeteaseLike.getState().refresh({ force: true });
  }
});
