import { getLyricsByBili } from "@/components/lyrics/get-lyrics";
import { usePlayList } from "@/store/play-list";

/**
 * 歌词解析入口。
 *
 * 顺序是：**多源聚合优先，B 站自带歌词兜底**。
 * 反过来的话，B 站字幕那种「一句一句的时间轴」会盖掉多源里带逐字时间轴的版本。
 *
 * 只在站点自带歌词确实拿不到东西时才回退，所以鬼畜 / 二创这类
 * 只有 B 站才有歌词的视频不会退化。
 */

/** B 站标题里常见的噪声词，不清掉会严重影响匹配 */
const TITLE_NOISE =
  /(官方|原版|正版|高清|无损|完整版|纯享|收藏级|重制|修复|搬运|转载|字幕|中文字幕|日文|罗马音|拼音|MV|PV|OP|ED|HD|4K|8K|1080P|720P|HiRes|Hi-Res|Live版|音频|音源|附歌词|带歌词|动态歌词|歌词版)/gi;

/** 上传者名字里带这些词的，基本不是歌手本人，不该当成 artist 传下去 */
const UPLOADER_NOISE = /(音乐|电台|频道|搬运|字幕|剪辑|收藏|歌单|合集|官方账号|Music|Radio|Channel|Collection)/i;

/**
 * 清洗 B 站标题。
 *
 * 典型输入：`【4K修复】周杰伦《夜曲》官方MV` → `周杰伦 夜曲`
 * 括号里的内容直接丢掉（大多是画质/版本标注），书名号里的保留（通常是歌名本身）。
 */
export const cleanTrackTitle = (raw: string) => {
  const source = String(raw ?? "").trim();
  const cleaned = source
    .replace(/《([^》]*)》/g, " $1 ")
    .replace(/[【[][^】]]*[】\]]/g, " ")
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(TITLE_NOISE, " ")
    .replace(/[-_|·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 清完只剩一两个字符时说明标题基本整句都是噪声，退回原串更安全
  return cleaned.length >= 2 ? cleaned : source;
};

/** 上传者名看起来像歌手时才把它当 artist 传下去 */
export const resolveArtistHint = (title: string, ownerName?: string) => {
  const owner = String(ownerName ?? "").trim();
  if (!owner || owner.length > 16) return "";
  if (UPLOADER_NOISE.test(owner)) return "";
  // 标题里出现了作者名 → 大概率就是歌手本人
  return title.includes(owner) ? owner : "";
};

export interface ResolvedLyrics {
  lyrics: string;
  wordLyrics: string;
  tLyrics: string;
  romanization: string;
  source: string;
  candidateId: string;
}

const empty = (): ResolvedLyrics => ({
  lyrics: "",
  wordLyrics: "",
  tLyrics: "",
  romanization: "",
  source: "",
  candidateId: "",
});

/**
 * 取歌词：先走多源聚合，没有再退到 B 站自带字幕。
 */
export async function resolveLyricsForCurrentTrack(): Promise<ResolvedLyrics | null> {
  const playItem = usePlayList.getState().getPlayItem();
  if (!playItem) return null;

  const rawTitle = playItem.pageTitle || playItem.title || "";
  const title = cleanTrackTitle(rawTitle);
  const artist = resolveArtistHint(rawTitle, playItem.ownerName);
  const durationMs = Math.max(0, Math.round((playItem.duration ?? 0) * 1000));

  if (title) {
    try {
      const result = await window.electron.resolveLyricsCandidates({
        // 曲目唯一键：用于人工选择记录与缓存
        trackKey: `${playItem.bvid ?? playItem.id}-${playItem.cid ?? playItem.pageIndex ?? ""}`,
        target: { title, artist, album: "", durationMs },
      });

      const picked = result?.picked;
      if (picked) {
        return {
          lyrics: picked.raw.lrc,
          wordLyrics: picked.raw.yrc,
          tLyrics: picked.raw.translation,
          romanization: picked.raw.romanization,
          source: picked.source,
          candidateId: picked.id,
        };
      }
    } catch {
      // 多源整体失败就继续往下走 B 站兜底
    }
  }

  // 兜底：B 站自带字幕
  if (playItem.bvid && playItem.cid) {
    try {
      const biliLyrics = await getLyricsByBili({ cid: Number(playItem.cid), bvid: playItem.bvid });
      if (biliLyrics?.length) {
        const toLrc = (rows: Array<{ time: number; text: string }>) =>
          rows
            .map(row => {
              const totalSeconds = row.time / 1000;
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = (totalSeconds % 60).toFixed(2).padStart(5, "0");
              return `[${String(minutes).padStart(2, "0")}:${seconds}]${row.text}`;
            })
            .join("\n");

        return { ...empty(), lyrics: toLrc(biliLyrics), source: "bilibili" };
      }
    } catch {
      // 兜底也失败，交给上层显示「暂无歌词」
    }
  }

  return null;
}
