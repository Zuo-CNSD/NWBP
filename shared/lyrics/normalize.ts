/**
 * 逐字时间轴归一化 + 组装成渲染单位（移植自 lyrimuse 的 LyricTimelineNormalizer）。
 *
 * 为什么需要这一步：服务端给的逐字时间轴经常是坏的 ——
 * 时间倒退、比行首还早、越过下一行。
 * 直接拿去渲染的表现是「整行字在某一帧全部亮起」或者「高亮卡住不动」。
 *
 * 处理策略只有两种：**能夹回就夹回，夹不回就整行降级成整行歌词**。
 * 降级比硬修安全：宁可这行不做逐字，也不要显示错误的高亮。
 */

import { isCreditLine } from "./parse";

/** 允许的时间轴偏差上限，超过就认为这条逐字数据不可信 */
export const MAX_WORD_DRIFT_MS = 250;

interface NormalizeResult {
  lines: LyricSyncedLine[];
  /** 因时间轴不可信而被降级成整行的行数 */
  degradedCount: number;
}

/** 把一段词序列拼成整行文本 */
const wordsToText = (words: LyricWord[]) => words.map(word => word.text).join("");

/** 词的结束时间 */
const wordEnd = (word: LyricWord) => word.startMs + word.durationMs;

/**
 * 逐字行的合法性检查。
 * 返回修复后的词序列，或 null 表示这行不可信、应降级。
 */
const repairWords = (words: LyricWord[], lineTimeMs: number, nextLineTimeMs: number | null): LyricWord[] | null => {
  if (!words.length) return null;

  /*
   * 规则 1：字时间倒退 → 整行不可信。
   * 注意必须在**排序之前**判断原始顺序 —— 先 sort 再比大小的话，
   * 排序本身就把「倒退」修掉了，这条规则会永远通过，等于没有。
   */
  for (let i = 1; i < words.length; i += 1) {
    if (words[i].startMs < words[i - 1].startMs) return null;
  }

  const sorted = [...words];

  // 规则 2：第一个字比行首早太多 → 整行不可信
  if (lineTimeMs - sorted[0].startMs > MAX_WORD_DRIFT_MS) return null;

  // 第一个字略早于行首（≤250ms）不算错，夹回行首即可
  if (sorted[0].startMs < lineTimeMs) sorted[0].startMs = lineTimeMs;

  if (nextLineTimeMs === null) return sorted;

  // 规则 3：最后一个字越过下一行
  const last = sorted[sorted.length - 1];
  const end = wordEnd(last);
  if (end > nextLineTimeMs) {
    const overshoot = end - nextLineTimeMs;
    if (overshoot > MAX_WORD_DRIFT_MS) return null; // 越太多，整行不可信
    // 越一点点：把最后一个字裁到下一行开始
    last.durationMs = Math.max(0, nextLineTimeMs - last.startMs);
  }

  return sorted;
};

/** 逐字行与整行行的允许时间差：源自不同接口时差几十毫秒是常态 */
const WORD_LINE_MATCH_TOLERANCE_MS = 500;

/** `歌手 - 歌名` 这种标题行，酷狗的歌词正文前面常带一条 */
const TITLE_HEADER_LINE = /^\s*\S{1,30}\s*[-–—]\s*\S{1,30}\s*$/;

/**
 * 去掉开头的制作信息与标题行。
 *
 * 酷狗 / QQ 的歌词正文前面会挂一小段
 * `周杰伦 - 夜曲` / `作词：方文山` / `作曲：周杰伦`，
 * 它们的时间戳都挤在最前面，滚动起来就是闪一下的噪音。
 *
 * 两道保险：只有在**剩余行数够多**时才删（避免把纯署名文件删成空），
 * 标题行也只看前 3 行。
 */
const stripLeadingCredits = (lines: LyricSyncedLine[]): LyricSyncedLine[] => {
  if (lines.length < 8) return lines;

  const kept = lines.filter((line, index) => {
    if (isCreditLine(line.text)) return false;
    // 标题行只看前两行，且整行除破折号外没有别的标点 —— 真歌词很少长这样
    if (index < 2 && TITLE_HEADER_LINE.test(line.text.trim())) return false;
    return true;
  });

  return kept.length >= 4 ? kept : lines;
};

/**
 * 归一化 + 组装。
 *
 * 输出的每一行都已经带上「整行时间 / 逐字 / 翻译 / 罗马音 / 对唱」，
 * 渲染层只负责按当前播放时间找行、算行内进度。
 */
export function normalizeLyrics(parsed: ParsedLyrics, extraOffsetMs = 0): NormalizeResult {
  const shift = (parsed.offsetMs ?? 0) + extraOffsetMs;

  const translationMap = new Map(parsed.translation.map(line => [line.timeMs, line.text]));
  const romanizationMap = new Map(parsed.romanization.map(line => [line.timeMs, line.text]));

  /*
   * 逐字行与整行行**未必时间完全一致** ——
   * 网易云的整行歌词和逐字歌词来自两个接口，差几十毫秒很常见；
   * 酷狗/QQ 那边甚至只给逐字、整行是另外算出来的。
   * 所以按「最近且在容差内」配对，每条逐字行只能用一次。
   */
  const pendingWordLines = [...parsed.wordLines].sort((a, b) => a.timeMs - b.timeMs);
  const usedWordLines = new Set<LyricWordLine>();

  const takeWordLine = (timeMs: number): LyricWordLine | undefined => {
    let best: LyricWordLine | undefined;
    let bestDiff = Number.POSITIVE_INFINITY;

    for (const line of pendingWordLines) {
      if (usedWordLines.has(line)) continue;
      const diff = Math.abs(line.timeMs - timeMs);
      if (diff <= WORD_LINE_MATCH_TOLERANCE_MS && diff < bestDiff) {
        best = line;
        bestDiff = diff;
      }
    }

    if (best) usedWordLines.add(best);
    return best;
  };

  // 逐字行可能比整行行数少/时间对不上，以整行为骨架、逐字按时间挂上去
  const skeleton = parsed.lines.length
    ? parsed.lines
    : parsed.wordLines.map(line => ({ timeMs: line.timeMs, text: wordsToText(line.words) }));

  const sorted = [...skeleton]
    .sort((a, b) => a.timeMs - b.timeMs)
    .map(line => ({ ...line, timeMs: line.timeMs + shift }));

  const out: LyricSyncedLine[] = [];
  let degradedCount = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const line = sorted[i];
    const nextTime = i + 1 < sorted.length ? sorted[i + 1].timeMs : null;

    const rawWords = takeWordLine(line.timeMs - shift);

    let words: LyricWord[] | undefined;
    if (rawWords) {
      const repaired = repairWords(rawWords.words, line.timeMs, nextTime);
      if (repaired) {
        words = repaired;
      } else {
        degradedCount += 1;
      }
    }

    const text = words ? wordsToText(words) : line.text;

    out.push({
      timeMs: line.timeMs,
      durationMs: nextTime !== null ? Math.max(0, nextTime - line.timeMs) : 0,
      text,
      words,
      translation: translationMap.get(line.timeMs - shift) || undefined,
      romanization: romanizationMap.get(line.timeMs - shift) || undefined,
    });
  }

  return { lines: stripLeadingCredits(out), degradedCount };
}

/** 末行补时长：没有下一行时用整首歌的时长兜底，否则末行永远没有进度 */
export const fillLastLineDuration = (lines: LyricSyncedLine[], totalDurationMs: number) => {
  if (!lines.length) return lines;
  const last = lines[lines.length - 1];
  if (last.durationMs > 0) return lines;

  const fallback = Math.max(2000, totalDurationMs - last.timeMs);
  return [...lines.slice(0, -1), { ...last, durationMs: fallback }];
};
