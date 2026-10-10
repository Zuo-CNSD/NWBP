/**
 * 认出「**当前账号自己的**那个『我喜欢的音乐』」。
 *
 * ⚠️ 为什么不能只判 `specialType === 5`：
 * 网易云把「我喜欢的音乐」做成 `specialType === 5` 的特殊歌单，但你**收藏（订阅）别人的
 * 「我喜欢的音乐」时，对方那个歌单返回的 `specialType` 同样是 5**。
 * 实测一个账号的 96 个歌单里有 3 个 `specialType === 5`：
 *
 * | id | 名字 | 曲目 | subscribed | creatorId |
 * | --- | --- | --- | --- | --- |
 * | 8389674163 | 会点技术的佳代子喜欢的音乐（本人） | 1001 | false | 8537154250 |
 * | 12959672023 | 白敬同学喜欢的音乐（收藏来的） | 345 | true | 12793057154 |
 * | 3088491029 | Z1xme喜欢的音乐（收藏来的） | 830 | true | 2054101902 |
 *
 * 原来两处都写 `list.find(x => x.specialType === 5)` —— 谁排前面就认谁，于是
 * 「我喜欢的音乐」页整个显示成别人的歌单（标题、曲目、共 N 首全错），
 * 播放栏那颗星星和右键菜单的「喜欢 / 取消喜欢」也全按别人的歌单算。
 *
 * 所以这里要求三个条件同时成立：`specialType === 5`、**不是收藏来的**、`creator` 就是当前 uid。
 *
 * ⚠️ 找不到时必须当「没有」处理（空态 / 提示登录），**绝不回退到列表第一项或任何写死的歌单 id**：
 * 这个应用是要分发给别人用的，写死某个账号的数据到了别人机器上会错得很隐蔽。
 */

/** 判定只需要这几个字段 —— 主进程的 `NeteasePlaylistInfo` 与渲染端拿到的结构都满足 */
export interface LikedPlaylistLike {
  specialType?: number;
  subscribed?: boolean;
  creatorId?: number | null;
}

/**
 * 这个歌单是不是「当前账号自己的」我喜欢的音乐。
 *
 * `uid` 缺失（渲染端还没水合完账号态）时退化成「只信 `subscribed`」：
 * 自己的那个 `subscribed` 一定是 false，收藏来的一定是 true，够用。
 */
export const isOwnLikedPlaylist = (playlist: LikedPlaylistLike | null | undefined, uid?: number | null): boolean => {
  if (!playlist || playlist.specialType !== 5) return false;
  // 收藏来的「我喜欢的音乐」是别人的歌单，不是「我的」
  if (playlist.subscribed) return false;

  const owner = playlist.creatorId;
  const self = typeof uid === "number" && uid > 0 ? uid : null;
  if (self !== null && typeof owner === "number" && owner > 0) return owner === self;

  // 拿不到 uid 或 creatorId 时不再多要求，前面的两个条件已经足够区分大部分情况
  return true;
};

/** 从歌单列表里挑出「我喜欢的音乐」；找不到返回 `undefined` */
export const findOwnLikedPlaylist = <T extends LikedPlaylistLike>(
  list: readonly T[] | null | undefined,
  uid?: number | null,
): T | undefined => list?.find(item => isOwnLikedPlaylist(item, uid));
