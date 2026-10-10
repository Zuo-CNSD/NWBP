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

/**
 * 「我喜欢的音乐」歌单 id 的缓存。
 *
 * ⚠️ **必须和 uid 绑在一起**：不同账号的「我喜欢的音乐」是两个**不同的歌单 id**。
 * 只存一个 `number` 的话，换账号之后这里还是上一个账号的歌单 ——
 * 表现就是「登录了别的账号，我喜欢的音乐和每首歌前面那颗星星还是上一个账号的」。
 * 绑上 uid 之后，uid 一变缓存自动失效，不需要每个登录/登出入口都记得来清一遍。
 */
let likedPlaylistIdCache: { uid: number; id: number } | null = null;

/** 读缓存。账号对不上、或压根没登录，都当作没有缓存 */
export const getCachedLikedPlaylistId = () => {
  const uid = neteaseAccountStore.get("uid");
  if (typeof uid !== "number" || uid <= 0) return null;
  return likedPlaylistIdCache?.uid === uid ? likedPlaylistIdCache.id : null;
};

export const setCachedLikedPlaylistId = (id: number | null) => {
  const uid = neteaseAccountStore.get("uid");
  likedPlaylistIdCache = id && typeof uid === "number" && uid > 0 ? { uid, id } : null;
};
