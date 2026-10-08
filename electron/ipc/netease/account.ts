import { neteaseAccountStore } from "../../store";
import { cleanCookieValue } from "./cookie";

/**
 * 网易云账号态。
 *
 * 直接以 electron-store 为准（它是内存对象 + 落盘，读开销可以忽略），
 * 不再维护第二份内存副本 —— 之前踩过「内存改了、落盘没跟上」导致重启掉登录的坑。
 */

export const readNeteaseCookie = () => cleanCookieValue(neteaseAccountStore.get("cookie"));

export const getNeteaseAccount = (): NeteaseAccountInfo => {
  const cookie = readNeteaseCookie();
  const uid = neteaseAccountStore.get("uid");
  const nickname = neteaseAccountStore.get("nickname") ?? "";
  const avatarUrl = neteaseAccountStore.get("avatarUrl") ?? "";

  return {
    loggedIn: Boolean(cookie) && typeof uid === "number" && uid > 0,
    uid: typeof uid === "number" && uid > 0 ? uid : null,
    nickname,
    avatarUrl,
  };
};

export const saveNeteaseAccount = (patch: Partial<NeteaseAccountState>) => {
  if (patch.cookie !== undefined) neteaseAccountStore.set("cookie", cleanCookieValue(patch.cookie));
  if (patch.uid !== undefined) neteaseAccountStore.set("uid", patch.uid);
  if (patch.nickname !== undefined) neteaseAccountStore.set("nickname", patch.nickname);
  if (patch.avatarUrl !== undefined) neteaseAccountStore.set("avatarUrl", patch.avatarUrl);

  return getNeteaseAccount();
};

export const clearNeteaseAccount = () => {
  neteaseAccountStore.set("cookie", "");
  neteaseAccountStore.set("uid", null);
  neteaseAccountStore.set("nickname", "");
  neteaseAccountStore.set("avatarUrl", "");

  return getNeteaseAccount();
};

/** 「我喜欢的音乐」歌单 id 缓存，避免每次收藏都重新拉一遍歌单列表 */
let likedPlaylistIdCache: number | null = null;

export const getCachedLikedPlaylistId = () => likedPlaylistIdCache;
export const setCachedLikedPlaylistId = (id: number | null) => {
  likedPlaylistIdCache = id;
};
