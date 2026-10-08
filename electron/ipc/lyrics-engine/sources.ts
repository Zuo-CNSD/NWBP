import log from "electron-log";
import got from "got";
import { inflateSync } from "node:zlib";

import { normLoose, titleMatchTier } from "@shared/lyrics/match";

import { getLyric as getNeteaseLyric, searchTracks as searchNeteaseTracks } from "../netease/api";

/**
 * 多源歌词抓取（移植自 lyrimuse 的 lyrimuse-collector）。
 *
 * 每个源都实现成「给一个目标，返回若干个原始候选」。
 * 这里只负责**取回原文**，解析和打分交给 shared/lyrics 里那套纯逻辑 ——
 * 这样换源、调权重都不用碰到网络代码。
 *
 * 收录标准是「不需要登录、不需要逆向加密」：
 *   网易云（含逐字 YRC）、LRCLIB（社区整行）、酷狗（KRC 逐字）、QQ（整行）
 * 刻意没收的：QQ 逐字（要 3DES 特定位实现）、咪咕（XXTEA）、
 * Musixmatch/Deezer（要 token/JWT + DoH）。
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const http = async <T>(url: string, options: { headers?: Record<string, string>; timeout?: number } = {}) => {
  const response = await got(url, {
    headers: { "User-Agent": UA, ...options.headers },
    timeout: { request: options.timeout ?? 12000 },
    retry: { limit: 1 },
    throwHttpErrors: false,
  });
  const text = response.body;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

/**
 * 有些主机在部分网络下 https 会证书不匹配（实测酷狗的 mobilecdn 被套了一层
 * 腾讯云 CDN，证书里根本没有这个域名），此时降级到 http 再试一次。
 * 这些接口返回的都是公开歌词，不涉及凭据。
 */
const httpWithFallback = async <T>(url: string, options: Parameters<typeof http>[1] = {}) => {
  try {
    return await http<T>(url, options);
  } catch (error) {
    if (!url.startsWith("https://")) throw error;
    log.warn(`[lyrics] ${url} 请求失败，降级 http 重试:`, error instanceof Error ? error.message : error);
    return http<T>(url.replace(/^https:/, "http:"), options);
  }
};

/**
 * 按「标题命中档位 + 歌手是否吻合 + 时长贴近度」给搜索结果预排序。
 *
 * 这一步很关键：网易云的搜索接口会把**翻唱版**排得很靠前，
 * 直接取前几条去拉歌词，很容易选中一个歌手不对的翻唱。
 * 拉歌词是逐条请求，只能在预排序后取前 N 条。
 */
const preRank = <T>(
  items: T[],
  target: LyricsMatchTarget,
  describe: (item: T) => { title: string; artist: string; durationMs: number },
) => {
  const artistKey = normLoose(target.artist);

  const score = (item: T) => {
    const { title, artist, durationMs } = describe(item);
    let value = titleMatchTier(target.title, title).points;

    const itemArtist = normLoose(artist);
    if (artistKey && itemArtist) {
      value += itemArtist.includes(artistKey) || artistKey.includes(itemArtist) ? 150 : -300;
    }

    if (target.durationMs && durationMs) {
      const ratio = Math.abs(durationMs - target.durationMs) / target.durationMs;
      value += Math.max(-200, Math.round(150 * (1 - ratio)));
    }

    return value;
  };

  return [...items].sort((a, b) => score(b) - score(a));
};

/** 一次给多少条候选拉歌词：每条都是独立请求，不宜太多 */
const DETAIL_FETCH_LIMIT = 3;

/** 搜索用的查询串：优先「歌手 歌名」，没有歌手就只用歌名 */
const queryOf = (target: LyricsMatchTarget) =>
  (target.artist ? `${target.artist} ${target.title}` : target.title).trim();

// ---------------------------------------------------------------- 网易云

const neteaseSource = async (target: LyricsMatchTarget): Promise<LyricsCandidatePayload[]> => {
  // 搜 10 条再预排序取前 3：接口本身会把翻唱排在很前面，直接把前几条拿去拉歌词会选错
  const { tracks } = await searchNeteaseTracks(queryOf(target), 10, 0);
  if (!tracks.length) return [];

  const picked = preRank(tracks, target, track => ({
    title: track.name,
    artist: track.artists,
    durationMs: track.duration,
  })).slice(0, DETAIL_FETCH_LIMIT);

  const results = await Promise.allSettled(
    picked.map(async track => {
      const lyric = await getNeteaseLyric(track.id);
      const candidate: LyricsCandidatePayload = {
        source: "netease",
        id: String(track.id),
        title: track.name,
        artist: track.artists,
        album: track.album,
        durationMs: track.duration,
        raw: {
          lrc: lyric.lrc,
          yrc: lyric.yrc,
          translation: lyric.translation,
          romanization: lyric.romanization,
        },
      };
      return candidate;
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<LyricsCandidatePayload> => r.status === "fulfilled")
    .map(r => r.value)
    .filter(c => c.raw.lrc || c.raw.yrc);
};

// ---------------------------------------------------------------- LRCLIB

const lrclibSource = async (target: LyricsMatchTarget): Promise<LyricsCandidatePayload[]> => {
  const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(target.title)}&artist_name=${encodeURIComponent(target.artist ?? "")}`;
  const list = await http<SearchSongByLrclibResponse[]>(url, { headers: { "Lrclib-Client": "NWBP/1.0.0" } });
  if (!Array.isArray(list)) return [];

  return list.slice(0, 5).map(
    (item): LyricsCandidatePayload => ({
      source: "lrclib",
      id: String(item.id ?? `${item.trackName}-${item.artistName}`),
      title: item.trackName ?? target.title,
      artist: item.artistName ?? "",
      album: item.albumName ?? "",
      durationMs: typeof item.duration === "number" ? item.duration * 1000 : 0,
      raw: {
        lrc: item.syncedLyrics ?? item.plainLyrics ?? "",
        yrc: "",
        translation: "",
        romanization: "",
      },
    }),
  );
};

// ---------------------------------------------------------------- 酷狗

/** 酷狗 KRC 的解密密钥（固定 16 字节，下标循环异或） */
const KRC_XOR_KEY = Buffer.from([
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
]);

/**
 * 解密 KRC：base64 → 去掉前 4 字节 `krc1` 魔数 → 循环异或 → zlib 解压。
 * 任何一步失败都返回空串，不让整个源挂掉。
 */
const decodeKrc = (base64Content: string) => {
  try {
    const raw = Buffer.from(base64Content, "base64");
    if (raw.length <= 4) return "";

    const body = raw.subarray(4);
    const decoded = Buffer.alloc(body.length);
    for (let i = 0; i < body.length; i += 1) decoded[i] = body[i] ^ KRC_XOR_KEY[i % KRC_XOR_KEY.length];

    return inflateSync(decoded).toString("utf-8");
  } catch (error) {
    log.warn("[lyrics:kugou] KRC 解密失败:", error instanceof Error ? error.message : error);
    return "";
  }
};

/** 酷狗有些接口不认标准百分号编码 */
const kugouEscape = (value: string) => encodeURIComponent(value).replace(/%20/g, "+");

const kugouSource = async (target: LyricsMatchTarget): Promise<LyricsCandidatePayload[]> => {
  const keyword = queryOf(target);
  const durationSec = target.durationMs ? Math.round(target.durationMs / 1000) : 0;

  const search = await httpWithFallback<{ data?: { info?: any[] } }>(
    `https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${kugouEscape(keyword)}&page=1&pagesize=10&showtype=1`,
  );
  const rawSongs = search?.data?.info ?? [];
  if (!rawSongs.length) return [];

  const songs = preRank(rawSongs as any[], target, song => ({
    title: String(song.songname ?? ""),
    artist: String(song.singername ?? ""),
    durationMs: Number(song.duration ?? 0) * 1000,
  })).slice(0, DETAIL_FETCH_LIMIT);

  const results = await Promise.allSettled(
    songs.map(async song => {
      const hash = String(song.hash ?? "");
      if (!hash) throw new Error("缺少 hash");

      const duration = Number(song.duration ?? durationSec) || durationSec;
      const candidates = await httpWithFallback<{ candidates?: Array<{ id: string; accesskey: string }> }>(
        `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=${kugouEscape(keyword)}&duration=${duration * 1000}&hash=${hash}`,
      );
      const first = candidates?.candidates?.[0];
      if (!first) throw new Error("没有歌词候选");

      const download = async (fmt: "lrc" | "krc") =>
        httpWithFallback<{ content?: string }>(
          `https://lyrics.kugou.com/download?ver=1&client=pc&id=${first.id}&accesskey=${first.accesskey}&fmt=${fmt}&charset=utf8`,
        );

      const [lrcRes, krcRes] = await Promise.allSettled([download("lrc"), download("krc")]);

      // fmt=lrc 返回的 content 是 base64 的明文 LRC
      const lrcText =
        lrcRes.status === "fulfilled" && lrcRes.value?.content
          ? Buffer.from(lrcRes.value.content, "base64").toString("utf-8")
          : "";

      const krcText = krcRes.status === "fulfilled" && krcRes.value?.content ? decodeKrc(krcRes.value.content) : "";

      // KRC 正文里内嵌了翻译与罗马音，格式是 [language:<base64 的 JSON>]
      let translation = "";
      let romanization = "";
      const languageTag = krcText.match(/\[language:([^\]]+)\]/);
      if (languageTag) {
        try {
          const meta = JSON.parse(Buffer.from(languageTag[1], "base64").toString("utf-8")) as {
            content?: Array<{ type?: number; lyricContent?: string[][] }>;
          };
          for (const entry of meta?.content ?? []) {
            const text = (entry.lyricContent ?? []).map(line => line.join("")).join("\n");
            // type 1 是翻译，0 是音译
            if (entry.type === 1) translation = text;
            else if (entry.type === 0) romanization = text;
          }
        } catch {
          /* 内嵌元信息解析失败不影响主歌词 */
        }
      }

      const candidate: LyricsCandidatePayload = {
        source: "kugou",
        id: String(first.id),
        title: String(song.songname ?? target.title),
        artist: String(song.singername ?? ""),
        album: String(song.album_name ?? ""),
        durationMs: duration * 1000,
        raw: {
          lrc: lrcText,
          // 逐字正文里的 [language:] 行要去掉，否则会被当成歌词
          yrc: krcText.replace(/\[language:[^\]]+\]/g, "").trim(),
          translation,
          romanization,
        },
      };
      return candidate;
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<LyricsCandidatePayload> => r.status === "fulfilled")
    .map(r => r.value)
    .filter(c => c.raw.lrc || c.raw.yrc);
};

// ---------------------------------------------------------------- QQ 音乐

const QQ_REFERER = "https://y.qq.com/";

/**
 * QQ 的搜索接口有多个镜像主机，可用性经常变：
 * 实测 c.y.qq.com 会直接返回 500（反爬），shc.y.qq.com 正常。
 * 所以按顺序试，谁通用谁。
 */
const QQ_HOSTS = ["https://shc.y.qq.com", "https://c.y.qq.com", "https://u.y.qq.com"];

const qqSearch = async (keyword: string) => {
  for (const host of QQ_HOSTS) {
    try {
      const res = await http<{ data?: { song?: { list?: any[] } } }>(
        `${host}/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(keyword)}&format=json&p=1&n=10&new_json=1&cr=1&aggr=1`,
        { headers: { Referer: QQ_REFERER } },
      );
      const list = res?.data?.song?.list;
      if (Array.isArray(list) && list.length) return list;
    } catch (error) {
      log.warn(`[lyrics:qq] ${host} 搜索失败:`, error instanceof Error ? error.message : error);
    }
  }
  return [];
};

const qqSource = async (target: LyricsMatchTarget): Promise<LyricsCandidatePayload[]> => {
  const keyword = queryOf(target);

  const rawSongs = await qqSearch(keyword);
  if (!rawSongs.length) return [];

  const songs = preRank(rawSongs as any[], target, song => ({
    title: String(song.name ?? song.title ?? ""),
    artist: Array.isArray(song.singer) ? song.singer.map((s: any) => s?.name ?? "").join(" / ") : "",
    durationMs: Number(song.interval ?? 0) * 1000,
  })).slice(0, DETAIL_FETCH_LIMIT);

  const results = await Promise.allSettled(
    songs.map(async song => {
      const mid = String(song.mid ?? song.songmid ?? "");
      if (!mid) throw new Error("缺少 songmid");

      let lyricRes: { lyric?: string; trans?: string } | null = null;
      for (const host of QQ_HOSTS) {
        try {
          const res = await http<{ lyric?: string; trans?: string }>(
            `${host}/lyric/fcgi-bin/fcg_query_lyric_new.fcg?format=json&nobase64=1&g_tk=5381&songmid=${mid}`,
            { headers: { Referer: QQ_REFERER } },
          );
          if (res?.lyric) {
            lyricRes = res;
            break;
          }
        } catch {
          /* 换下一个主机 */
        }
      }

      // 没加 nobase64 时会返回 base64；这里做了兜底，避免服务端忽略参数
      const decode = (value?: string) => {
        if (!value) return "";
        if (/^[\x20-\x7e\s]*$/.test(value) && value.includes("[")) return value;
        try {
          return Buffer.from(value, "base64").toString("utf-8");
        } catch {
          return value;
        }
      };

      const candidate: LyricsCandidatePayload = {
        source: "qq",
        id: mid,
        title: String(song.name ?? song.title ?? target.title),
        artist: Array.isArray(song.singer)
          ? song.singer
              .map((s: any) => s?.name ?? "")
              .filter(Boolean)
              .join(" / ")
          : "",
        album: String(song.album?.name ?? ""),
        durationMs: Number(song.interval ?? 0) * 1000,
        raw: {
          lrc: decode(lyricRes?.lyric),
          yrc: "",
          translation: decode(lyricRes?.trans),
          romanization: "",
        },
      };
      return candidate;
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<LyricsCandidatePayload> => r.status === "fulfilled")
    .map(r => r.value)
    .filter(c => c.raw.lrc);
};

// ---------------------------------------------------------------- 调度

const SOURCE_FETCHERS: Record<
  Exclude<LyricsSourceId, "local">,
  (target: LyricsMatchTarget) => Promise<LyricsCandidatePayload[]>
> = {
  netease: neteaseSource,
  lrclib: lrclibSource,
  kugou: kugouSource,
  qq: qqSource,
};

export interface FetchAllResult {
  candidates: LyricsCandidatePayload[];
  status: Array<{ source: LyricsSourceId; ok: boolean; count: number; error?: string }>;
}

/** 并发抓所有源。单个源失败不影响其它源 */
export async function fetchAllSources(target: LyricsMatchTarget, sources?: LyricsSourceId[]): Promise<FetchAllResult> {
  const wanted = (
    sources?.length ? sources : (Object.keys(SOURCE_FETCHERS) as Array<keyof typeof SOURCE_FETCHERS>)
  ).filter((source): source is keyof typeof SOURCE_FETCHERS => source in SOURCE_FETCHERS);

  const settled = await Promise.allSettled(wanted.map(source => SOURCE_FETCHERS[source](target)));

  const candidates: LyricsCandidatePayload[] = [];
  const status: FetchAllResult["status"] = [];

  settled.forEach((result, index) => {
    const source = wanted[index];
    if (result.status === "fulfilled") {
      candidates.push(...result.value);
      status.push({ source, ok: true, count: result.value.length });
    } else {
      status.push({ source, ok: false, count: 0, error: String(result.reason?.message ?? result.reason) });
      log.warn(`[lyrics] ${source} 抓取失败:`, result.reason);
    }
  });

  return { candidates, status };
}

/** 供网易云歌曲直接用 id 取词（不需要搜索） */
export const fetchNeteaseById = async (
  id: number,
  target: LyricsMatchTarget,
): Promise<LyricsCandidatePayload | null> => {
  try {
    const lyric = await getNeteaseLyric(id);
    if (!lyric.lrc && !lyric.yrc) return null;
    return {
      source: "netease",
      id: String(id),
      title: target.title,
      artist: target.artist,
      album: target.album,
      durationMs: target.durationMs,
      raw: { lrc: lyric.lrc, yrc: lyric.yrc, translation: lyric.translation, romanization: lyric.romanization },
    };
  } catch (error) {
    log.warn("[lyrics] 按 id 取网易云歌词失败:", error);
    return null;
  }
};
