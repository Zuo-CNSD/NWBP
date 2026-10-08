/**
 * 歌词解析（移植自 lyrimuse 的 LRCParser / YRCParser）。
 *
 * 需要同时吃下四种时间轴格式：
 *
 *   1. 普通 LRC      [00:12.34]歌词
 *   2. 网易云 YRC    [行始,行长](词始绝对,词长,flag)词(词始,词长,flag)词...
 *   3. QQ/咪咕 QRC   [行始,行长]词(词始,词长)词(词始,词长)...
 *   4. 酷狗 KRC      [行始,行长]<词相对偏移,词长,flag>词<偏移,词长,flag>词...
 *
 * 关键差异只有两点：**标记在词的前面还是后面**，以及**词时间是绝对值还是相对行首**。
 * 解析时统一换算成「绝对毫秒」，下游就不用再关心来源了。
 */

const PLAIN_TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const OFFSET_TAG = /\[offset:\s*([+-]?\d+)\s*\]/i;
const WORD_LINE_TAG = /^\[(\d+),(\d+)\]\s*(.*)$/;
/** YRC / KRC：标记在前，后面跟到下一个标记为止是词文本 */
const YRC_WORD = /\((-?\d+),(\d+)(?:,(\d+))?\)([^()]*)/g;
const KRC_WORD = /<(-?\d+),(\d+)(?:,(\d+))?>([^<>]*)/g;
/** QRC：标记在后，词文本在标记之前 */
const QRC_TUPLE = /\((-?\d+),(\d+)(?:,(\d+))?\)/g;

/**
 * 文本里可能出现 CRLF。
 * Swift 的 split 在 CRLF 下会整首切不开，JS 的 split(/\r?\n/) 没这个问题，
 * 但统一归一化一遍仍然更稳（有些源会在行内塞 \r）。
 */
const normalizeNewlines = (raw: string) => raw.replace(/\r\n?/g, "\n");

/** 滤掉 `(123,456)` 这种残缺二元组：某些源在行尾截断时会留下它 */
const stripMalformedTuples = (text: string) => text.replace(/\(\d+,\d+\)/g, "");

/** 只有署名信息、没有真正歌词内容的行 */
const CREDIT_ONLY =
  /^(作词|作曲|编曲|制作人|混音|母带|录音|监制|出品|词|曲|OP|SP|SP\s*:|吉他|贝斯|鼓|键盘|和声|统筹|企划|发行|宣传|封面|设计)\s*[:：]/;
export const isCreditLine = (text: string) => CREDIT_ONLY.test(text.trim());

const toMs = (minutes: string, seconds: string, fraction?: string) => {
  const min = Number(minutes);
  const sec = Number(seconds);
  if (Number.isNaN(min) || Number.isNaN(sec)) return null;

  // 小数位可能是 1~3 位：.5 = 500ms，.50 = 500ms，.500 = 500ms
  const frac = fraction ? Number(fraction.padEnd(3, "0")) : 0;
  if (Number.isNaN(frac)) return null;

  return Math.max(0, min * 60_000 + sec * 1000 + frac);
};

/**
 * 解析普通 LRC。
 * 一行可以有多个时间戳（副歌复用同一句），每个时间戳都要产出一条。
 */
export function parsePlainLrc(raw: string): { lines: LyricPlainLine[]; offsetMs: number } {
  const text = normalizeNewlines(raw ?? "");
  const lines: LyricPlainLine[] = [];
  let offsetMs = 0;

  for (const line of text.split("\n")) {
    const offsetMatch = line.match(OFFSET_TAG);
    if (offsetMatch) {
      const value = Number(offsetMatch[1]);
      if (Number.isFinite(value)) offsetMs = value;
      continue;
    }

    const content = line.replace(PLAIN_TIME, "").trim();
    // 纯元数据行（[ar:] / [ti:] / [by:] 之类）在这里就被滤掉：
    // 它们没有 mm:ss 时间戳，content 虽然非空但不会有匹配
    PLAIN_TIME.lastIndex = 0;
    const times: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = PLAIN_TIME.exec(line)) !== null) {
      const ms = toMs(match[1], match[2], match[3]);
      if (ms !== null) times.push(ms);
    }
    PLAIN_TIME.lastIndex = 0;

    if (!times.length) continue;
    if (!content) continue;

    for (const timeMs of times) lines.push({ timeMs, text: content });
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  return { lines, offsetMs };
}

/** 判断一段文本是不是「逐字」格式，以及是哪种 */
const detectWordFormat = (raw: string) => {
  const text = normalizeNewlines(raw ?? "").trim();
  if (!/^\[\d+,\d+\]/m.test(text)) return null;

  const firstBody =
    text
      .split("\n")
      .find(line => WORD_LINE_TAG.test(line))
      ?.match(WORD_LINE_TAG)?.[3] ?? "";
  // 注意 `-?`：坏数据里会出现负数时间戳，检测正则不收的话整份逐字都会被跳过
  if (/<(-?\d+),(\d+)/.test(firstBody)) return "krc" as const;
  if (/^\((-?\d+),(\d+)/.test(firstBody.trim())) return "yrc" as const;
  if (/\((-?\d+),(\d+)\)/.test(firstBody)) return "qrc" as const;
  return null;
};

export const hasWordTiming = (raw: string) => detectWordFormat(raw) !== null;

/**
 * 解析逐字歌词。三种格式统一输出「绝对毫秒」。
 */
export function parseWordLyrics(raw: string): LyricWordLine[] {
  const text = normalizeNewlines(raw ?? "");
  const format = detectWordFormat(text);
  if (!format) return [];

  const out: LyricWordLine[] = [];

  for (const line of text.split("\n")) {
    const lineMatch = line.match(WORD_LINE_TAG);
    if (!lineMatch) continue;

    const lineStart = Number(lineMatch[1]);
    const lineDuration = Number(lineMatch[2]);
    if (!Number.isFinite(lineStart)) continue;

    // 只有 YRC 的合法标记是三元组 (start,dur,flag)，二元组才是截断残留。
    // QRC 的合法标记**本来就是二元组**，对它做清理会把所有时间戳删光。
    const body = format === "yrc" ? stripMalformedTuples(lineMatch[3] ?? "") : (lineMatch[3] ?? "");
    const words: LyricWord[] = [];

    if (format === "krc") {
      // 酷狗：偏移是**相对行首**的，不换算会出现「一行所有词瞬间填满」
      KRC_WORD.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = KRC_WORD.exec(body)) !== null) {
        const offset = Number(m[1]);
        const duration = Number(m[2]);
        if (!Number.isFinite(offset) || !Number.isFinite(duration)) continue;
        words.push({ startMs: lineStart + offset, durationMs: duration, text: m[4] ?? "" });
      }
      KRC_WORD.lastIndex = 0;
    } else if (format === "qrc") {
      // QQ / 咪咕：词文本在标记**之前**
      QRC_TUPLE.lastIndex = 0;
      let m: RegExpExecArray | null;
      let cursor = 0;
      while ((m = QRC_TUPLE.exec(body)) !== null) {
        const segmentText = body.slice(cursor, m.index);
        cursor = m.index + m[0].length;
        const startMs = Number(m[1]);
        const durationMs = Number(m[2]);
        if (!Number.isFinite(startMs) || !Number.isFinite(durationMs)) continue;
        words.push({ startMs, durationMs, text: segmentText });
      }
      QRC_TUPLE.lastIndex = 0;
      // 标记之后可能还有一段收尾文本，没有时间戳，挂到最后一个词上
      if (cursor < body.length && words.length) words[words.length - 1].text += body.slice(cursor);
    } else {
      // 网易云 YRC：词时间是绝对值，标记在词**之前**
      YRC_WORD.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = YRC_WORD.exec(body)) !== null) {
        const startMs = Number(m[1]);
        const durationMs = Number(m[2]);
        if (!Number.isFinite(startMs) || !Number.isFinite(durationMs)) continue;
        words.push({ startMs, durationMs, text: m[4] ?? "" });
      }
      YRC_WORD.lastIndex = 0;
    }

    if (!words.length) continue;

    out.push({
      timeMs: lineStart,
      durationMs: Number.isFinite(lineDuration) ? lineDuration : undefined,
      words,
    });
  }

  out.sort((a, b) => a.timeMs - b.timeMs);
  return out;
}

/**
 * 把翻译 / 罗马音对齐到主歌词上。
 *
 * 源里这两路本来就是「同一批时间戳的另一份文本」，所以优先按时间精确匹配；
 * 少数源时间戳对不齐（差几十毫秒），给一个容差窗口；再不行、且行数一致时按顺序兜底。
 */
export function alignSideText(mainTimes: number[], side: { lines: LyricPlainLine[] }): Map<number, string> {
  const result = new Map<number, string>();
  if (!side.lines.length || !mainTimes.length) return result;

  const sideLines = [...side.lines].sort((a, b) => a.timeMs - b.timeMs);
  const used = new Set<number>();

  const take = (index: number) => {
    used.add(index);
    return sideLines[index].text;
  };

  // 1) 精确时间
  for (const timeMs of mainTimes) {
    const index = sideLines.findIndex((line, i) => !used.has(i) && line.timeMs === timeMs);
    if (index >= 0) result.set(timeMs, take(index));
  }

  // 2) ±200ms 容差
  for (const timeMs of mainTimes) {
    if (result.has(timeMs)) continue;
    const index = sideLines.findIndex((line, i) => !used.has(i) && Math.abs(line.timeMs - timeMs) <= 200);
    if (index >= 0) result.set(timeMs, take(index));
  }

  // 3) 行数一致时按顺序
  if (result.size === 0 && sideLines.length === mainTimes.length) {
    mainTimes.forEach((timeMs, i) => result.set(timeMs, sideLines[i].text));
  }

  return result;
}

/** 把一段来源原文整体解析成 ParsedLyrics */
export function parseLyrics(raw: {
  lrc?: string;
  yrc?: string;
  translation?: string;
  romanization?: string;
}): ParsedLyrics {
  const wordLines = parseWordLyrics(raw.yrc ?? "");
  const plain = parsePlainLrc(raw.lrc ?? "");

  // 只有逐字、没有整行时，用逐字行的起止时间合成整行时间轴，
  // 这样翻译对齐、偏移、缓存等下游逻辑都能照常工作
  const lines =
    plain.lines.length > 0
      ? plain.lines
      : wordLines.map(line => ({ timeMs: line.timeMs, text: line.words.map(w => w.text).join("") }));

  const translation = parsePlainLrc(raw.translation ?? "");
  const romanization = parsePlainLrc(raw.romanization ?? "");

  // [offset:] 以整行那份为准；逐字那份一般不带你
  const offsetMs = plain.offsetMs || parsePlainLrc(raw.translation ?? "").offsetMs || 0;

  return {
    lines,
    wordLines,
    translation: translation.lines,
    romanization: romanization.lines,
    offsetMs,
    hasWordTiming: wordLines.length > 0,
  };
}
