import { create } from "zustand";

import { useNeteaseTogether } from "./netease-together";

/**
 * 网易云账号状态。
 *
 * 为什么单独开一个 store：**侧栏的「网易云」分组要按登录态决定显示不显示**，
 * 而登录动作发生在设置页。原来账号信息只是设置页里的一个局部 state，
 * 登录完之后侧栏不知道 —— 必须有个共享的地方。
 *
 * 注意它和 `useUser`（B 站账号）是两套：这个 app 允许只登录其中一家。
 */
interface NeteaseState {
  account: NeteaseAccountInfo | null;
  /** 是否已经问过一次主进程 —— 用来区分「没登录」和「还没查」 */
  loaded: boolean;
  refresh: () => Promise<void>;
  setAccount: (account: NeteaseAccountInfo) => void;
}

/** 掉登录态时把一起听房间也收掉 —— 否则轮询会一直拿着过期 cookie 去打接口 */
const dropRoomIfLoggedOut = (account: NeteaseAccountInfo | null) => {
  if (!account?.loggedIn && useNeteaseTogether.getState().role !== "idle") {
    void useNeteaseTogether.getState().leaveRoom();
  }
};

export const useNetease = create<NeteaseState>()(set => ({
  account: null,
  loaded: false,

  refresh: async () => {
    try {
      const account = await window.electron?.netease?.getAccount?.();
      set({ account: account ?? null, loaded: true });
      dropRoomIfLoggedOut(account ?? null);
    } catch {
      set({ account: null, loaded: true });
    }
  },

  setAccount: account => {
    set({ account, loaded: true });
    dropRoomIfLoggedOut(account);
  },
}));

/** 已登录网易云？没查过 / 没登录都算 false */
export const isNeteaseLoggedIn = () => Boolean(useNetease.getState().account?.loggedIn);
