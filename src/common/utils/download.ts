import { t } from "@/common/i18n";

/**
 * 「下载音频 / 视频」的来源解析。
 *
 * 曲目分三类，而 `electron/ipc/download` 那套下载管道认的字段完全不同：
 *
 *  - **网易云**（`source === "netease"`）：没有 bvid / cid / sid，唯一身份是 `neteaseId`。
 *    主进程里**没有网易云接口**，所以必须在渲染层先把直链换出来，用 `audioUrl` 交给下载器。
 *  - **B 站音频**（`type === "audio"` 且带 `sid`）：交给 `sid`，主进程走 `getAudioWebStreamUrl`。
 *  - **B 站视频**（`type === "mv"`）：`bvid` + `cid`，主进程自己去取 dash 流。
 *
 * ⚠️ 这里踩过一个坑：原来两处下载入口都把 `item.id` 当成 `sid` 传下去 ——
 * 那是**播放列表内部的字符串 id**（`idGenerator()` 造的，形如 `"17916288851841"`），
 * 不是 B 站的 sid；而网易云曲目连 `sid` 字段都没有，于是任务必然走到
 * `setDownloadUrl()` 的兜底分支，抛出 `can't get audio url`。
 * 表现就是「菜单点得动、下载页里多出一条永远失败的任务」。
 */

export type NeteaseSongLevel = "standard" | "exhigh" | "lossless";

/**
 * 把播放器里的音质档位翻成网易云的 `level` 参数。
 *
 * 档位语义对不齐是正常的：B 站那边是「自动 / 无损 / 高 / 中 / 低」，
 * 网易云只有 standard / exhigh / lossless 三档。
 * 「自动」按 B 站那边的习惯往好里取（那边 auto 也是优先 flac），
 * 拿不到就让服务端降级 —— 网易云自己会返回能给的最高档。
 */
export const toNeteaseLevel = (quality: AudioQuality): NeteaseSongLevel => {
  switch (quality) {
    case "low":
      return "standard";
    case "medium":
      return "exhigh";
    default:
      return "lossless";
  }
};

export interface DownloadSourceItem {
  type?: string;
  source?: string;
  bvid?: string;
  cid?: string | number;
  sid?: string | number;
  neteaseId?: number;
}

export type DownloadSourcePlan =
  | { kind: "netease"; neteaseId: number }
  | { kind: "bili-audio"; sid: string | number }
  | { kind: "bili-video"; bvid: string; cid?: string | number }
  | { kind: "none"; reason: string };

/**
 * 纯函数：判断这个播放项该走哪条下载通道。
 * 单独抽出来是为了能直接单测 —— 真跑一遍下载要联网、要写盘，不适合做回归。
 */
export const planDownloadSource = (item: DownloadSourceItem): DownloadSourcePlan => {
  // 网易云必须排在最前：它的 type 也是 "audio"，但**没有 sid**，
  // 如果先判 `type === "audio"` 就会落进 B 站音频那条，拿不到东西。
  if (item.source === "netease" && typeof item.neteaseId === "number" && item.neteaseId > 0) {
    return { kind: "netease", neteaseId: item.neteaseId };
  }

  if (item.type === "audio" && item.sid !== undefined && item.sid !== null && String(item.sid).length > 0) {
    return { kind: "bili-audio", sid: item.sid };
  }

  if (item.bvid) {
    return { kind: "bili-video", bvid: item.bvid, cid: item.cid };
  }

  return { kind: "none", reason: t("这首歌没有可下载的音源") };
};

/** 下载管道真正需要的来源字段（对应 shared/types/download.d.ts 的 MediaDownloadInfo） */
export interface ResolvedDownloadSource {
  audioUrl?: string;
  bvid?: string;
  cid?: string | number;
  sid?: string | number;
}

export type ResolveDownloadSourceResult =
  | {
      ok: true;
      /** 直接摊进 addMediaDownloadTask 的字段 */
      source: ResolvedDownloadSource;
      /** 该曲目能否「下载视频」（网易云、B 站音频站都没有视频流） */
      canDownloadVideo: boolean;
    }
  | { ok: false; reason: string };

export const resolveDownloadSource = async (
  item: DownloadSourceItem,
  level: NeteaseSongLevel,
): Promise<ResolveDownloadSourceResult> => {
  const plan = planDownloadSource(item);

  switch (plan.kind) {
    case "netease": {
      const data = await window.electron.netease.songUrl(plan.neteaseId, level);
      if (!data?.url) {
        return { ok: false, reason: t("无法获取下载地址：这首歌可能需要网易云会员，或已下架") };
      }
      /*
       * 网易云直链不带 `deadline` 参数，主进程的 `isUrlValid()` 会把它判成「无效」，
       * 但 `setDownloadUrl()` 里 `sid` / `bvid` 都为空时会什么都不做，
       * 于是 `audioUrl` 原样保留、不会抛 `can't get audio url` —— 正是想要的行为。
       */
      return { ok: true, source: { audioUrl: data.url }, canDownloadVideo: false };
    }
    case "bili-audio":
      return { ok: true, source: { sid: plan.sid }, canDownloadVideo: false };
    case "bili-video":
      return { ok: true, source: { bvid: plan.bvid, cid: plan.cid }, canDownloadVideo: true };
    default:
      return { ok: false, reason: plan.reason };
  }
};
