import { describe, expect, test } from "vitest";

import { findOwnLikedPlaylist, isOwnLikedPlaylist, type LikedPlaylistLike } from "@shared/netease/playlist";

/** 一个歌单列表项里参与判定的字段 + 用来肉眼确认选中的是哪个 */
const pl = (patch: Partial<LikedPlaylistLike> & { id?: number; name?: string }) => ({ id: 0, name: "", ...patch });

/** 实测数据：uid 8537154250 的「我的歌单」里 3 个 specialType === 5 */
const SELF_UID = 8537154250;
const REAL_LIKED = pl({
  id: 8389674163,
  name: "会点技术的佳代子喜欢的音乐",
  specialType: 5,
  subscribed: false,
  creatorId: SELF_UID,
});
const BAIJING = pl({
  id: 12959672023,
  name: "白敬同学喜欢的音乐",
  specialType: 5,
  subscribed: true,
  creatorId: 12793057154,
});
const Z1XME = pl({ id: 3088491029, name: "Z1xme喜欢的音乐", specialType: 5, subscribed: true, creatorId: 2054101902 });

describe("isOwnLikedPlaylist", () => {
  test("自己的那个：specialType 5 + 非收藏 + creator 是自己", () => {
    expect(isOwnLikedPlaylist(REAL_LIKED, SELF_UID)).toBe(true);
  });

  test("收藏来的「我喜欢的音乐」不算 —— 它们的 specialType 同样是 5", () => {
    expect(isOwnLikedPlaylist(BAIJING, SELF_UID)).toBe(false);
    expect(isOwnLikedPlaylist(Z1XME, SELF_UID)).toBe(false);
  });

  test("creatorId 和自己对不上就不算（哪怕接口没标 subscribed）", () => {
    expect(isOwnLikedPlaylist(pl({ specialType: 5, subscribed: false, creatorId: 999 }), SELF_UID)).toBe(false);
  });

  test("uid 缺失时退化成只看「非收藏」，仍能认对自己的那个", () => {
    expect(isOwnLikedPlaylist(REAL_LIKED, null)).toBe(true);
    expect(isOwnLikedPlaylist(BAIJING, null)).toBe(false);
  });

  test("specialType 不是 5 的一律不算（私人雷达 100 / 官方歌单 300 之类）", () => {
    expect(isOwnLikedPlaylist(pl({ specialType: 100, subscribed: true, creatorId: 1 }), SELF_UID)).toBe(false);
    expect(isOwnLikedPlaylist(pl({ specialType: 0, subscribed: false, creatorId: SELF_UID }), SELF_UID)).toBe(false);
    expect(isOwnLikedPlaylist(pl({ subscribed: false, creatorId: SELF_UID }), SELF_UID)).toBe(false);
  });

  test("空值不炸", () => {
    expect(isOwnLikedPlaylist(null, SELF_UID)).toBe(false);
    expect(isOwnLikedPlaylist(undefined, SELF_UID)).toBe(false);
  });
});

describe("findOwnLikedPlaylist", () => {
  test("列表里三个 specialType===5 时挑出自己的，而不是排在最前的那个", () => {
    // 收藏来的排在前面 —— 老写法 `find(x => x.specialType === 5)` 就是在这里认错的
    const list = [BAIJING, Z1XME, REAL_LIKED];
    expect(findOwnLikedPlaylist(list, SELF_UID)?.id).toBe(8389674163);
    expect(findOwnLikedPlaylist([...list].reverse(), SELF_UID)?.id).toBe(8389674163);
  });

  test("只有收藏来的（比如刚换了个没建过歌单的号）→ 返回 undefined，不回退到第一项", () => {
    expect(findOwnLikedPlaylist([BAIJING, Z1XME], SELF_UID)).toBeUndefined();
  });

  test("空列表 / null 不炸", () => {
    expect(findOwnLikedPlaylist([], SELF_UID)).toBeUndefined();
    expect(findOwnLikedPlaylist(null, SELF_UID)).toBeUndefined();
    expect(findOwnLikedPlaylist(undefined, SELF_UID)).toBeUndefined();
  });
});
