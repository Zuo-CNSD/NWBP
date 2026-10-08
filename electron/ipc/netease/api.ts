import log from "electron-log";

import {
  clearNeteaseAccount,
  getCachedLikedPlaylistId,
  getNeteaseAccount,
  readNeteaseCookie,
  saveNeteaseAccount,
  setCachedLikedPlaylistId,
} from "./account";
import { neteaseFormPost, neteaseGet, neteaseWeapiPost } from "./client";
import { cookiePairs, mergeCookies, NETEASE_COOKIE_OS } from "./cookie";

/**
 * 网易云具体接口。全部移植自 ncm-player 的服务端实现，注释里标了对应的踩坑点。
 */

const API = "https://music.163.com/api";

/** 统一把封面地址升成 https，避免混合内容被拦 */
const https = (url?: string | null) => String(url ?? "").replace(/^http:/, "https:");

const joinArtists = (list: Array<{ name?: string }> = []) =>
  list
    .map(a => a?.name ?? "")
    .filter(Boolean)
    .join(" / ");

/**
 * 归一化歌曲。
 * 兼容两种返回结构：`/api/search/get` 用 artists/album，
 * `/api/v3/song/detail` 与歌单用 ar/al —— 不兼容会出现「搜索有结果但没封面没歌手」。
 */
const normalizeTrack = (song: any): NeteaseTrack => {
  const artists = Array.isArray(song?.ar) ? song.ar : Array.isArray(song?.artists) ? song.artists : [];
  const album = song?.al ?? song?.album ?? {};
  const duration = typeof song?.dt === "number" ? song.dt : typeof song?.duration === "number" ? song.duration : 0;

  return {
    id: Number(song?.id ?? 0),
    name: String(song?.name ?? "未知歌曲"),
    artists: joinArtists(artists),
    album: String(album?.name ?? ""),
    albumId: typeof album?.id === "number" ? album.id : null,
    cover: https(album?.picUrl ?? song?.picUrl),
    duration,
    fee: typeof song?.fee === "number" ? song.fee : undefined,
  };
};

const normalizePlaylist = (playlist: any): NeteasePlaylistInfo => ({
  id: Number(playlist?.id ?? 0),
  name: String(playlist?.name ?? "").slice(0, 120),
  cover: https(playlist?.coverImgUrl),
  trackCount: Number(playlist?.trackCount ?? 0),
  creator: String(playlist?.creator?.nickname ?? ""),
  specialType: playlist?.specialType ?? 0,
  subscribed: Boolean(playlist?.subscribed),
});

/** 批量补封面：旧搜索接口不返回 picUrl */
const enrichCovers = async (tracks: NeteaseTrack[]) => {
  const ids = tracks
    .map(t => t.id)
    .filter(id => Number.isFinite(id) && id > 0)
    .slice(0, 30);
  if (!ids.length) return;

  try {
    const c = encodeURIComponent(JSON.stringify(ids.map(id => ({ id }))));
    const detail = await neteaseGet<{ songs?: any[] }>(`${API}/v3/song/detail?c=${c}`);
    const byId = new Map<number, NeteaseTrack>();
    for (const song of detail?.songs ?? []) {
      const normalized = normalizeTrack(song);
      byId.set(normalized.id, normalized);
    }

    for (const track of tracks) {
      const full = byId.get(track.id);
      if (!full) continue;
      if (full.cover) track.cover = full.cover;
      if (full.album) track.album = full.album;
      if (full.albumId) track.albumId = full.albumId;
      if (!track.artists && full.artists) track.artists = full.artists;
    }
  } catch (error) {
    // 补封面失败不能影响搜索结果本身
    log.warn("[netease] 搜索封面补全失败:", error);
  }
};

// ---------------------------------------------------------------- 搜索 / 发现

export const searchTracks = async (keyword: string, limit = 30, offset = 0) => {
  const kw = keyword.trim();
  if (!kw) throw new Error("请输入关键词");

  const res = await neteaseGet<{ result?: { songs?: any[]; songCount?: number } }>(
    `${API}/search/get?s=${encodeURIComponent(kw)}&type=1&limit=${limit}&offset=${offset}`,
  );
  const songs = res?.result?.songs;
  if (!Array.isArray(songs)) throw new Error("搜索失败");

  const tracks = songs.map(normalizeTrack);
  await enrichCovers(tracks);

  return { tracks, total: res?.result?.songCount ?? tracks.length };
};

export const searchPlaylists = async (keyword: string, limit = 30, offset = 0) => {
  const kw = keyword.trim();
  if (!kw) throw new Error("请输入关键词");

  const res = await neteaseGet<{ result?: { playlists?: any[] } }>(
    `${API}/search/get?s=${encodeURIComponent(kw)}&type=1000&limit=${limit}&offset=${offset}`,
  );
  const list = res?.result?.playlists;
  if (!Array.isArray(list)) throw new Error("搜索失败");

  return list.map(normalizePlaylist);
};

export const searchAlbums = async (keyword: string, limit = 30, offset = 0) => {
  const kw = keyword.trim();
  if (!kw) throw new Error("请输入关键词");

  const res = await neteaseGet<{ result?: { albums?: any[] } }>(
    `${API}/search/get?s=${encodeURIComponent(kw)}&type=10&limit=${limit}&offset=${offset}`,
  );
  const list = res?.result?.albums;
  if (!Array.isArray(list)) throw new Error("搜索失败");

  return list.map(
    (a: any): NeteaseAlbumInfo => ({
      id: Number(a?.id ?? 0),
      name: String(a?.name ?? "未知专辑"),
      cover: https(a?.picUrl),
      artist: String(a?.artist?.name ?? ""),
      trackCount: Number(a?.size ?? 0),
    }),
  );
};

/** 热门歌单（发现页用） */
export const hotPlaylists = async (limit = 30) => {
  const res = await neteaseGet<{ playlists?: any[] }>(
    `${API}/playlist/list?cat=${encodeURIComponent("全部")}&order=hot&limit=${limit}&offset=0`,
  );
  if (!Array.isArray(res?.playlists)) throw new Error("获取热门歌单失败");

  return res.playlists.map(normalizePlaylist);
};

// ---------------------------------------------------------------- 歌单 / 专辑

/** 分批拉歌曲详情：接口一次最多 100 个 id，超了会截断 */
const fetchTracksByIds = async (ids: number[]) => {
  const tracks: NeteaseTrack[] = [];

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const c = encodeURIComponent(JSON.stringify(chunk.map(id => ({ id }))));
    const res = await neteaseGet<{ songs?: any[] }>(`${API}/v3/song/detail?c=${c}`);
    for (const song of res?.songs ?? []) tracks.push(normalizeTrack(song));
  }

  return tracks;
};

export const getPlaylistDetail = async (id: number): Promise<NeteasePlaylistDetail> => {
  const res = await neteaseGet<{ playlist?: any }>(`${API}/v6/playlist/detail?id=${encodeURIComponent(String(id))}`);
  const playlist = res?.playlist;
  if (!playlist) throw new Error("歌单不存在或已失效");

  const ids = (playlist.trackIds ?? [])
    .map((t: any) => Number(t?.id))
    .filter((v: number) => Number.isFinite(v) && v > 0)
    .slice(0, 300);

  return {
    id: Number(playlist.id),
    name: String(playlist.name ?? "未命名歌单"),
    cover: https(playlist.coverImgUrl),
    trackCount: Number(playlist.trackCount ?? ids.length),
    tracks: await fetchTracksByIds(ids),
  };
};

export const getAlbumDetail = async (id: number): Promise<NeteaseAlbumDetail> => {
  // 这个接口要求带 os=pc，否则会走成移动端结构
  const res = await neteaseGet<{ album?: any }>(`${API}/album/${encodeURIComponent(String(id))}`, { osPc: true });
  const album = res?.album;
  if (!album) throw new Error("专辑不存在或已失效");

  const tracks = (Array.isArray(album.songs) ? album.songs : []).map(normalizeTrack);

  return {
    id: Number(album.id),
    name: String(album.name ?? "未知专辑"),
    cover: https(album.picUrl),
    artist: String(album.artist?.name ?? ""),
    tracks,
  };
};

// ---------------------------------------------------------------- 我的音乐

export const getMyPlaylists = async () => {
  const account = getNeteaseAccount();
  if (!account.uid) throw new Error("未登录：请先在设置中登录网易云账号");

  const res = await neteaseGet<{ playlist?: any[] }>(`${API}/user/playlist?uid=${account.uid}&limit=1000&offset=0`);
  const list = res?.playlist;
  if (!Array.isArray(list)) throw new Error("获取歌单失败");

  const items = list.map(normalizePlaylist);
  // 「我喜欢的音乐」置顶 → 自己建的 → 收藏的
  const rank = (x: NeteasePlaylistInfo) => (x.specialType === 5 ? 0 : x.subscribed ? 2 : 1);
  items.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "zh"));

  return items;
};

export const getMyAlbums = async () => {
  const account = getNeteaseAccount();
  if (!account.uid) throw new Error("未登录：请先在设置中登录网易云账号");

  const out: NeteaseAlbumInfo[] = [];
  for (let offset = 0; offset < 500 && out.length < 300; offset += 50) {
    const res = await neteaseGet<{ data?: any[] }>(`${API}/album/sublist?limit=50&offset=${offset}&total=true`);
    // 注意：TS 5.5 起 Array.isArray 会把实参窄化成 unknown[]，
    // 断言要放在窄化之后，否则下面每个字段访问都会报 unknown
    const raw = res?.data;
    if (!Array.isArray(raw) || raw.length === 0) break;
    const list = raw as any[];

    for (const album of list) {
      out.push({
        id: Number(album.id),
        name: String(album.name ?? "未知专辑"),
        cover: https(album.picUrl),
        artist: String(album.artists?.[0]?.name ?? ""),
        trackCount: Number(album.size ?? 0),
      });
    }

    if (list.length < 50) break;
  }

  return out;
};

// ---------------------------------------------------------------- 播放地址

/**
 * 播放地址三级降级：
 *   1. v1 接口按音质档位取（要 cookie 才能拿无损）
 *   2. 老的 br 接口
 *   3. 外链兜底 —— 免费曲目能直接播，付费曲目会 404，只能让上层提示无版权
 */
export const getSongUrl = async (id: number, level: "standard" | "exhigh" | "lossless" = "exhigh") => {
  const ids = encodeURIComponent(`[${id}]`);

  if (readNeteaseCookie()) {
    try {
      const res = await neteaseGet<{ data?: Array<{ url?: string | null; br?: number; level?: string }> }>(
        `${API}/song/enhance/player/url/v1?ids=${ids}&level=${level}&encodeType=flac`,
      );
      const url = https(res?.data?.[0]?.url);
      if (url && url.length > 10) return { url, level: res?.data?.[0]?.level ?? level };
    } catch (error) {
      log.warn("[netease] v1 播放地址失败，降级:", error);
    }
  }

  try {
    const res = await neteaseGet<{ data?: Array<{ url?: string | null; br?: number }> }>(
      `${API}/song/enhance/player/url?ids=${ids}&br=320000`,
    );
    const url = https(res?.data?.[0]?.url);
    if (url && url.length > 10) return { url, level: "exhigh" };
  } catch (error) {
    log.warn("[netease] br 播放地址失败，降级外链:", error);
  }

  return { url: `https://music.163.com/song/media/outer/url?id=${id}.mp3`, level: "standard" };
};

// ---------------------------------------------------------------- 歌词

export const getLyric = async (id: number): Promise<NeteaseLyricResult> => {
  const empty: NeteaseLyricResult = { lrc: "", yrc: "", translation: "", romanization: "" };

  // 两次请求：老接口给整行/翻译/罗马音，v1 给逐字 YRC
  const [plain, word] = await Promise.allSettled([
    neteaseGet<{ lrc?: NeteaseKlyric; tlyric?: NeteaseKlyric; romalrc?: NeteaseKlyric }>(
      `${API}/song/lyric?os=pc&id=${id}&lv=-1&kv=-1&tv=-1&rv=-1`,
    ),
    neteaseGet<{ yrc?: NeteaseKlyric; ytlrc?: NeteaseKlyric; yromalrc?: NeteaseKlyric }>(
      `${API}/song/lyric/v1?id=${id}&lv=-1&kv=-1&tv=-1&rv=-1&yv=-1&ytv=-1&yrv=-1`,
    ),
  ]);

  const result: NeteaseLyricResult = { ...empty };

  if (plain.status === "fulfilled") {
    result.lrc = plain.value?.lrc?.lyric ?? "";
    result.translation = plain.value?.tlyric?.lyric ?? "";
    result.romanization = plain.value?.romalrc?.lyric ?? "";
  }

  if (word.status === "fulfilled") {
    result.yrc = word.value?.yrc?.lyric ?? "";
  }

  return result;
};

// ---------------------------------------------------------------- 收藏

const resolveLikedPlaylistId = async () => {
  const cached = getCachedLikedPlaylistId();
  if (cached) return cached;

  const items = await getMyPlaylists();
  const liked = items.find(item => item.specialType === 5);
  if (!liked) throw new Error("未找到「我喜欢的音乐」歌单");

  setCachedLikedPlaylistId(liked.id);
  return liked.id;
};

export const likeSong = async (id: number, like: boolean) => {
  if (!getNeteaseAccount().uid) throw new Error("请先登录网易云账号");
  await resolveLikedPlaylistId();

  const res = await neteaseWeapiPost<{ code?: number; message?: string }>(
    `${API}/radio/like?alg=itembased&trackId=${id}&like=${like}`,
    { trackId: id, like },
  );

  if (!res || res.code !== 200) {
    throw new Error(`收藏操作失败${res?.message ? `：${res.message}` : ""}（可能是账号风控，稍后再试）`);
  }

  return true;
};

export const getLikedIds = async () => {
  const pid = await resolveLikedPlaylistId();
  const detail = await getPlaylistDetail(pid);
  return detail.tracks.map(track => track.id);
};

// ---------------------------------------------------------------- 登录

/** 用 cookie 换账号信息，顺带校验 cookie 是否还有效 */
const accountFromCookie = async (cookie: string) => {
  const res = await neteaseWeapiPost<{
    code?: number;
    profile?: { userId?: number; nickname?: string; avatarUrl?: string };
  }>(`${API}/nuser/account/get`, {}, { cookie });

  const profile = res?.profile;
  if (!res || res.code !== 200 || !profile?.userId) {
    throw new Error("登录凭据无效或已过期");
  }

  return {
    uid: profile.userId,
    nickname: String(profile.nickname ?? ""),
    avatarUrl: https(profile.avatarUrl),
  };
};

export const loginWithCookie = async (rawCookie: string) => {
  const cookie = String(rawCookie ?? "").trim();
  if (!cookie) throw new Error("请粘贴 Cookie");

  const info = await accountFromCookie(cookie);
  return saveNeteaseAccount({ cookie, ...info });
};

export const logout = () => {
  setCachedLikedPlaylistId(null);
  return clearNeteaseAccount();
};

export const getAccount = () => getNeteaseAccount();

/** 扫码登录的会话态：unikey → 累积的 cookie */
const qrSessions = new Map<string, string>();

export const createQrSession = async (): Promise<NeteaseQrSession> => {
  const res = await neteaseFormPost<{ code?: number; unikey?: string }>(`${API}/login/qrcode/unikey`, "type=3", {
    cookie: "",
  });

  const unikey = res.json?.unikey;
  if (res.json?.code !== 200 || !unikey) throw new Error("获取二维码失败");

  // 首次下发就把 cookie 记下来（后续轮询要带上，否则登录态接不上）
  qrSessions.set(unikey, mergeCookies(NETEASE_COOKIE_OS, cookiePairs(res.setCookies)));

  return { unikey, loginUrl: `https://music.163.com/login?codekey=${unikey}` };
};

export const checkQrSession = async (key: string): Promise<NeteaseQrCheckResult> => {
  const session = qrSessions.get(key) ?? NETEASE_COOKIE_OS;

  const res = await neteaseFormPost<{ code?: number; message?: string }>(
    `${API}/login/qrcode/client/login`,
    `key=${encodeURIComponent(key)}&type=3`,
    { cookie: session },
  );

  const merged = mergeCookies(session, cookiePairs(res.setCookies));
  qrSessions.set(key, merged);

  const code = Number(res.json?.code ?? 0);
  const message = String(res.json?.message ?? "");

  if (code !== 803) {
    if (code === 800) qrSessions.delete(key);
    return { code, message };
  }

  // 803 = 授权成功，用累积到的 cookie 换账号信息
  const info = await accountFromCookie(merged);
  const account = saveNeteaseAccount({ cookie: merged, ...info });
  qrSessions.delete(key);

  return { code, message, account };
};
