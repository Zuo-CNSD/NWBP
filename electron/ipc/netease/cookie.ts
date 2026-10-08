/**
 * 网易云的 Cookie 处理（移植自 ncm-player）。
 *
 * 这些不是随手写的字符串拼接，每一条都对应一个踩过的坑：
 *  - 值里的双引号必须去掉：历史上它把持久化的 settings JSON 截断过；
 *  - 合并必须按 key 去重：扫码登录会分多次下发 Set-Cookie，
 *    直接往后拼会出现两个 MUSIC_U，服务端认的是第一个（往往还是旧的空值）；
 *  - 有些接口必须带 `os=pc`：缺了会走成移动端返回结构。
 */

export const NETEASE_COOKIE_OS = "os=pc";

/** 去掉值里的双引号与首尾空白 —— 双引号会让下游 JSON 损坏 */
export const cleanCookieValue = (value: unknown) =>
  String(value ?? "")
    .replace(/"/g, "")
    .trim();

/** 把 Set-Cookie 数组压成 `k=v` 列表（只取第一个 `;` 之前的部分） */
export const cookiePairs = (setCookies: readonly string[] = []): string[] => {
  const pairs: string[] = [];

  for (const raw of setCookies) {
    const eq = raw.indexOf("=");
    if (eq > 0) pairs.push(`${raw.slice(0, eq)}=${cleanCookieValue(raw.slice(eq + 1).split(";")[0])}`);
  }

  return pairs;
};

/** 按 key 合并 cookie 串，后出现的覆盖先出现的 */
export const mergeCookies = (existing: string, pairs: readonly string[]): string => {
  const map = new Map<string, string>();

  const absorb = (chunk: string) => {
    for (const part of chunk.split(";")) {
      const eq = part.indexOf("=");
      if (eq > 0) map.set(part.slice(0, eq).trim(), cleanCookieValue(part.slice(eq + 1)));
    }
  };

  if (existing) absorb(existing);
  for (const pair of pairs) absorb(pair);

  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
};

/** 需要带 `os=pc` 的接口用它拼，避免到处硬编码前缀 */
export const withOsPc = (cookie: string) => (cookie ? `${NETEASE_COOKIE_OS}; ${cookie}` : NETEASE_COOKIE_OS);

/** 从 cookie 串里取某个 key 的值 */
export const readCookieValue = (cookie: string, key: string): string | null => {
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === key) return cleanCookieValue(part.slice(eq + 1));
  }
  return null;
};
