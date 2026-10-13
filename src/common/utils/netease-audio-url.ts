import type { NeteaseSongLevel } from "@/common/utils/download";

/**
 * 网易云播放地址的缓存与预取。
 *
 * ## 为什么需要它
 *
 * 网易云给的播放地址**不带 `deadline` 参数**，`isUrlValid()` 判断不了它什么时候过期，
 * 所以 `play-list.ts` 每次播放都会老老实实重新取一次 —— 表现出来就是
 * 「点一下 → 等一次网络往返 → 才出声」，也就是那个卡顿。
 *
 * 缓存解决的是**重复播放**（同一首再点一下立刻出声），预取解决的是**切歌**
 * （下一首的地址提前取好，轮到它时不用等网络）。
 *
 * ## 过期怎么处理
 *
 * 网易云的地址实际能活几个小时，但没必要赌：10 分钟足够覆盖
 * 「来回切歌 / 同一首重播」这类真实场景，过期之后自然会重取一次。
 */

/** 缓存有效期：10 分钟 */
export const NETEASE_URL_TTL = 10 * 60 * 1000;

interface CachedUrl {
  url: string;
  /** 实际拿到的音质 —— 接口可能降级，不一定是请求的那个档位 */
  level: string;
  at: number;
}

const cache = new Map<string, CachedUrl>();

/**
 * 正在飞的请求。
 * 预取刚发出去、用户正好点了播放，两边会撞上 —— 用这个合并成一次请求。
 */
const inflight = new Map<string, Promise<{ url: string; level: string }>>();

const keyOf = (id: number, level: NeteaseSongLevel) => `${id}:${level}`;

/** 只读缓存：命中且没过期才有值。给需要同步判断的地方用。 */
export const peekNeteaseUrl = (id: number, level: NeteaseSongLevel): CachedUrl | null => {
  const key = keyOf(id, level);
  const hit = cache.get(key);
  if (!hit) return null;

  if (Date.now() - hit.at > NETEASE_URL_TTL) {
    cache.delete(key);
    return null;
  }

  return hit;
};

/** 取播放地址：命中缓存就直接返回，否则请求一次并写回缓存。 */
export const fetchNeteaseUrl = async (id: number, level: NeteaseSongLevel) => {
  const cached = peekNeteaseUrl(id, level);
  if (cached) return { url: cached.url, level: cached.level };

  const key = keyOf(id, level);
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = window.electron.netease
    .songUrl(id, level)
    .then(data => {
      if (data?.url) cache.set(key, { url: data.url, level: data.level, at: Date.now() });
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
};

/**
 * 预取：故意把错误吞掉。
 * 预取只是「顺手做的事」，失败了就当没发生 —— 真正轮到这首播时还会再走一次完整流程。
 */
export const prefetchNeteaseUrl = (id?: number | null, level: NeteaseSongLevel = "exhigh") => {
  if (!id) return;
  void fetchNeteaseUrl(id, level).catch(() => {});
};

/** 换账号 / 退出登录时清掉，避免把上一个账号拿到的地址用到新账号上 */
export const clearNeteaseUrlCache = () => {
  cache.clear();
  inflight.clear();
};
