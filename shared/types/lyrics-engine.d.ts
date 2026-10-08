/**
 * 歌词引擎的数据模型（移植自 lyrimuse）。
 *
 * 全部按项目既有约定写成**全局声明**，这样 `shared/lyrics/*` 的纯算法模块、
 * 主进程的抓取层、渲染端的 IPC 类型可以共用一套结构，不用在 .d.ts 里 import
 * （.d.ts 一旦有 import 就变成模块，全局声明会失效）。
 *
 * 命名刻意避开 lyrics.d.ts 里已有的 LyricLine / MusicLyrics。
 */

/** 歌词来源 */
type LyricsSourceId = "netease" | "qq" | "kugou" | "lrclib" | "local";

/** 整行时间轴的歌词行 */
interface LyricPlainLine {
  timeMs: number;
  text: string;
}

/**
 * 逐字片段。
 * startMs 是**相对整首歌开头**的绝对毫秒（酷狗那种相对行首的偏移在解析时就换算掉了），
 * 这样渲染时不用再关心来源差异。
 */
interface LyricWord {
  startMs: number;
  durationMs: number;
  text: string;
}

/** 带逐字时间轴的歌词行 */
interface LyricWordLine {
  timeMs: number;
  /** 行头声明的行长（毫秒）。只有时间轴修复会用它，可能是 undefined */
  durationMs?: number;
  words: LyricWord[];
}

/** 解析结果：四种时间轴分开存，交给归一化与渲染阶段合并 */
interface ParsedLyrics {
  /** 整行歌词 */
  lines: LyricPlainLine[];
  /** 逐字歌词（已按时间排序） */
  wordLines: LyricWordLine[];
  translation: LyricPlainLine[];
  romanization: LyricPlainLine[];
  /** 文本里 `[offset:±ms]` 标签声明的整体偏移 */
  offsetMs: number;
  /** 是否带逐字时间轴 */
  hasWordTiming: boolean;
}

/** 对唱声部 */
type LyricDuetSide = "leading" | "trailing" | "center";

/** 最终交给渲染层的一行 */
interface LyricSyncedLine {
  timeMs: number;
  durationMs: number;
  text: string;
  /** 有逐字时间轴时存在，此时 text 由 words 拼出 */
  words?: LyricWord[];
  translation?: string;
  romanization?: string;
  /** 对唱标记；undefined 表示来源没给对唱信息 */
  side?: LyricDuetSide;
  /** 背景和声（AMLL 的 x-bg） */
  background?: string;
  /** 逐字按对唱分段（AMLL 的 ttm:agent 分组用） */
  segments?: LyricSyncedSegment[];
}

/** 对唱分角色后的一段（同一人连续唱的部分） */
interface LyricSyncedSegment {
  side: LyricDuetSide | null;
  words: LyricWord[];
  text: string;
  romanization?: string;
}

/** 主进程抓回来的候选（歌词原文还没解析） */
interface LyricsCandidatePayload {
  source: LyricsSourceId;
  /** 源内 id，用于手选记录与缓存 */
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  raw: {
    /** 整行歌词原文 */
    lrc: string;
    /** 逐字歌词原文（YRC / QRC / KRC 不定） */
    yrc: string;
    translation: string;
    romanization: string;
  };
}

/** 解析 + 打分后的候选 */
interface LyricsScoredCandidate extends LyricsCandidatePayload {
  score: number;
  /** 打分明细，弹窗里展示「为什么选它」 */
  reasons: string[];
  parsed: ParsedLyrics;
}

/** 目标歌曲信息，用于打分 */
interface LyricsMatchTarget {
  title: string;
  artist: string;
  album: string;
  /** 毫秒 */
  durationMs: number;
}

/** 人工选定的歌词来源记录（按曲目 id 存） */
interface LyricsMatchRecord {
  source: LyricsSourceId;
  candidateId: string;
  /** 手选的不会再被自动匹配覆盖 */
  manual: boolean;
  updatedAt: number;
}

/** 多源歌词聚合的入参 */
interface LyricsResolveParams {
  /** 曲目唯一键（用于手选记录与缓存） */
  trackKey: string;
  target: LyricsMatchTarget;
  /** 忽略缓存强制重新抓取 */
  force?: boolean;
  /** 只从这些源取；不传表示全部 */
  sources?: LyricsSourceId[];
}

interface LyricsResolveResult {
  /** 按分数降序的候选 */
  candidates: LyricsScoredCandidate[];
  /** 自动选中的那条（最高分）；全部被淘汰时为 null */
  picked: LyricsScoredCandidate | null;
  /** picked 是否来自人工选择 */
  fromManualPick: boolean;
  /** 每个源的结果，用于 UI 展示「哪个源没找到」 */
  sourceStatus: Array<{ source: LyricsSourceId; ok: boolean; count: number; error?: string }>;
}
