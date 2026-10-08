/**
 * 歌词候选的匹配打分（移植自 lyrimuse 的 match.go）。
 *
 * 套路是：**先用布尔闸把明显不对的整条淘汰，再对剩下的多项加权求和**，
 * 最后把总分夹到 ≥1（保留相对顺序，避免出现 0 分与 1 分无法区分）。
 *
 * 几处关键取舍，都是原项目做过消融实验的结论，照搬过来：
 *  - 时长不符**不是**一票否决，而是 -500。因为翻录/现场版时长差很大但歌词是对的，
 *    一票否决的误杀率远高于放过；
 *  - 逐字歌词 +400，是「质量直接证据」，故意让它压过「同源 +250」；
 *  - 来源静态偏好（比如「网易云一律加分」）被删掉了 —— 那是 0 次改对、6 次改错。
 */

import { Converter } from "opencc-js/t2cn";

/** 繁体 → 简体。用 t2cn 子路径（109KB）而不是 full（1.2MB），只需要这一个方向 */
let toSimplifiedConverter: ((text: string) => string) | null = null;
let converterResolved = false;

const resolveConverter = () => {
  if (converterResolved) return toSimplifiedConverter;
  converterResolved = true;

  try {
    toSimplifiedConverter = Converter({ from: "tw", to: "cn" });
  } catch {
    // 词典加载失败不影响打分主流程，退化成恒等
    toSimplifiedConverter = null;
  }

  return toSimplifiedConverter;
};

const toSimplified = (text: string) => {
  const converter = resolveConverter();
  if (!converter) return text;
  try {
    return converter(text);
  } catch {
    return text;
  }
};

/** 折叠变音符号：é → e，保证 "Björk" 与 "Bjork" 能对上 */
const foldDiacritics = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");

/**
 * 宽松归一化：小写 → 繁转简 → 折叠变音 → 只留字母/数字/汉字。
 * 标点、空格、符号全部丢掉。
 */
export const normLoose = (text: string) =>
  foldDiacritics(toSimplified(String(text ?? "").toLowerCase()))
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();

/** 去掉成对括号及其内容 */
export const stripParens = (text: string) =>
  String(text ?? "")
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/[【[][^】]]*[】\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** 结构前缀白名单：这些是「曲式」而不是作品名的一部分 */
const STRUCTURAL_PREFIX = /^(medley|interlude|组曲|串烧|序曲)\s*[:：\-–—]?\s*/i;

export const stripStructuralPrefix = (text: string) =>
  String(text ?? "")
    .replace(STRUCTURAL_PREFIX, "")
    .trim();

/** 版本限定词 → 规范键 */
const VERSION_ALIASES: Record<string, string> = {
  现场: "live",
  演唱会: "live",
  不插电: "unplugged",
  伴奏: "instrumental",
  纯音乐: "instrumental",
  清唱: "a cappella",
  阿卡贝拉: "a cappella",
  acapella: "a cappella",
  混音: "remix",
  加长版: "extended",
  完整版: "extended",
  排练: "rehearsal",
  试听: "demo",
  小样: "demo",
};

const VERSION_WORDS = [
  "demo",
  "live",
  "unplugged",
  "acoustic",
  "instrumental",
  "karaoke",
  "remix",
  "extended",
  "radio edit",
  "alternate",
  "rehearsal",
  "reprise",
  "a cappella",
  "club mix",
  "dj mix",
  "continuous mix",
  "edit",
  "day version",
  "night version",
  "现场",
  "演唱会",
  "不插电",
  "伴奏",
  "纯音乐",
  "清唱",
  "混音",
  "加长版",
  "完整版",
  "阿卡贝拉",
  "排练",
  "试听",
  "小样",
];

/** 拉丁限定词必须按**词元**匹配：用子串会踩 `(Come Alive)` 里冒出 `live` 的坑 */
const containsVersionWord = (scope: string, word: string) => {
  if (/^[\x20-\x7e]+$/.test(word)) {
    // 转义空格等正则元字符后，用 \b 卡词边界
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`\\b${escaped}\\b`, "i").test(scope);
  }
  // 中文没有词边界，子串匹配即可
  return scope.includes(word);
};

/**
 * 抽出标题/专辑里的版本限定词。
 *
 * 只扫**括号内**与**尾部**的片段，不扫正文 ——
 * 否则 `(Come Alive)` 会冒出 live、`(Deluxe Edition)` 会冒出 edit。
 */
export const versionTags = (text: string): Set<string> => {
  const raw = String(text ?? "").toLowerCase();
  const tags = new Set<string>();

  const scopes: string[] = [];
  for (const match of raw.matchAll(/[（(【[]([^）)】]]*)[）)】]]/g)) scopes.push(match[1]);
  // 尾部 24 个字符也纳入扫描（` - Single` / ` - Remastered` 这种尾巴）
  scopes.push(raw.slice(-24));

  for (const scope of scopes) {
    for (const word of VERSION_WORDS) {
      if (containsVersionWord(scope, word)) tags.add(VERSION_ALIASES[word] ?? word);
    }
  }

  return tags;
};

/** 版本标签不一致 → 极可能是不同的录音版本 */
export const versionTagsMismatch = (a: string, b: string) => {
  const ta = versionTags(a);
  const tb = versionTags(b);
  if (ta.size !== tb.size) return true;
  for (const tag of ta) if (!tb.has(tag)) return true;
  return false;
};

/**
 * 分词：汉字按单字切，拉丁/数字按连续段切。
 * 这样 `Album One` 与 `Album1` 会共享 `album` 这个词元，而不是整串比较。
 */
export const tokenize = (text: string) => {
  const normalized = normLoose(text);
  const tokens: string[] = [];
  let buffer = "";

  for (const char of normalized) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
      if (buffer) {
        tokens.push(buffer);
        buffer = "";
      }
      tokens.push(char);
    } else {
      buffer += char;
    }
  }
  if (buffer) tokens.push(buffer);

  return tokens.filter(Boolean);
};

/** 专辑亲密度：相等最高，互为子串次之，共享词元再次 */
export const albumScore = (a: string, b: string) => {
  const na = normLoose(a);
  const nb = normLoose(b);
  if (!na || !nb) return 0;
  if (na === nb) return 200;
  if (na.includes(nb) || nb.includes(na)) return 100;

  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared += 1;
  return shared;
};

/**
 * 标题匹配档位。
 *
 * 分档必须**逐级比较**，不能把几种形态混成一个集合去求交集 ——
 * 否则 `夜曲` vs `夜曲 (Live)` 会因为「去括号后相等」直接吃到完全一致的 120 分，
 * 等于把「精确命中」和「只差个版本后缀」混为一谈。
 *
 * 也**绝不做任意双向子串包含**：那会让 `Love` 匹配到 `Love Story`。
 */
export const titleMatchTier = (target: string, candidate: string): { points: number; reason?: string } => {
  const nt = normLoose(target);
  const nc = normLoose(candidate);

  if (nt && nt === nc) return { points: 120, reason: "标题完全一致" };

  // 只有括号差异（`xxx` vs `xxx (Live)`）
  const pt = normLoose(stripParens(target));
  const pc = normLoose(stripParens(candidate));
  if (pt && pt === pc) return { points: 60, reason: "标题仅括号差异" };

  // 只有结构前缀差异（`组曲：xxx` vs `xxx`）
  const st = normLoose(stripStructuralPrefix(target));
  const sc = normLoose(stripStructuralPrefix(candidate));
  if (st && st === sc) return { points: 60, reason: "标题仅结构前缀差异" };

  // 双语标题：`标题 / Title` 里任一段对上
  const splitBilingual = (text: string) =>
    text
      .split(/[/／|｜]/)
      .map(part => normLoose(part))
      .filter(Boolean);
  const bt = splitBilingual(target);
  const bc = splitBilingual(candidate);
  for (const a of bt) for (const b of bc) if (a && a === b) return { points: 30, reason: "双语标题命中小节" };

  return { points: 0 };
};

/** 3-gram Jaccard 相似度，用于「多个源都指向同一份歌词」的交叉印证 */
export const textSimilarity = (a: string, b: string) => {
  const grams = (text: string) => {
    const normalized = normLoose(text);
    const set = new Set<string>();
    for (let i = 0; i + 3 <= normalized.length; i += 1) set.add(normalized.slice(i, i + 3));
    return set;
  };

  const ga = grams(a);
  const gb = grams(b);
  if (!ga.size || !gb.size) return 0;

  let intersection = 0;
  for (const gram of ga) if (gb.has(gram)) intersection += 1;

  return intersection / (ga.size + gb.size - intersection);
};

/** 整份歌词只有署名行 */
export const isCreditOnly = (lines: LyricPlainLine[]) => {
  const meaningful = lines.filter(line => line.text.trim());
  if (!meaningful.length) return true;
  return meaningful.every(line => /^(作词|作曲|编曲|制作|混音|出品|词|曲)\s*[:：]/.test(line.text.trim()));
};

/** 含中文的比例 */
const cjkRatio = (text: string) => {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (!letters) return 0;
  const cjk = letters.replace(/[^\u4e00-\u9fff\u3400-\u4dbf]/g, "");
  return cjk.length / letters.length;
};

export interface ScoreInput {
  target: LyricsMatchTarget;
  candidate: LyricsCandidatePayload;
  parsed: ParsedLyrics;
  /** 同一批候选里，有多少条与它歌词高度相似（交叉印证） */
  consensusPeers: number;
  /** 该源自报的时长（毫秒） */
  sourceDurationMs?: number;
  /** 歌手是否也对得上 */
  artistMatches?: boolean;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
  rejected: boolean;
}

const DURATION_TOLERANCE = 0.25;
const DURATION_OVERSHOOT_S = 5;

/**
 * 打分主入口。
 * 返回 score = -1 表示被布尔闸淘汰。
 */
export function scoreLyricCandidate(input: ScoreInput): ScoreResult {
  const { target, candidate, parsed, consensusPeers } = input;
  const reasons: string[] = [];

  const lyricsText = parsed.lines.map(line => line.text).join("\n");

  // ---------- 布尔闸 ----------
  if (!parsed.lines.length) return { score: -1, reasons: ["没有可用歌词"], rejected: true };
  if (!parsed.hasWordTiming && parsed.lines.every(line => line.timeMs === 0)) {
    return { score: -1, reasons: ["无时间轴（纯文本）"], rejected: true };
  }
  if (isCreditOnly(parsed.lines)) return { score: -1, reasons: ["只有署名行"], rejected: true };

  // 语言明显不对：目标是纯拉丁、歌词却几乎全是中文（有其他源印证时豁免）
  if (cjkRatio(target.title) < 0.05 && cjkRatio(lyricsText) > 0.7 && consensusPeers < 1) {
    return { score: -1, reasons: ["语言不匹配"], rejected: true };
  }

  // 连续混音：本地标了 dj mix、候选却没标
  {
    const tTags = versionTags(target.title);
    const cTags = versionTags(candidate.title);
    if (tTags.has("dj mix") && !cTags.has("dj mix"))
      return { score: -1, reasons: ["连续混音版本不符"], rejected: true };
  }

  // ---------- 加权项 ----------
  let score = 0;

  const duration = candidate.durationMs || 0;
  const targetDuration = target.durationMs || 0;

  if (targetDuration > 0 && duration > 0) {
    const ratio = Math.abs(duration - targetDuration) / targetDuration;

    if (ratio <= DURATION_TOLERANCE) {
      // 越贴合给得越高：100（刚好卡在 25%）~ 300（完全一致）
      const points = Math.round(100 + 200 * (1 - ratio / DURATION_TOLERANCE));
      score += points;
      reasons.push(`时长吻合 +${points}`);
    } else {
      score -= 500;
      reasons.push("时长差 >25% -500");
    }

    // 歌词比歌还长（末句超出曲长 5 秒以上）→ 基本可以断定是别的版本
    if (targetDuration > 0 && duration > targetDuration + DURATION_OVERSHOOT_S * 1000) {
      score -= 700;
      reasons.push("歌词超出曲长 -700");
    }
  }

  if (input.sourceDurationMs && targetDuration > 0) {
    const ratio = Math.abs(input.sourceDurationMs - targetDuration) / targetDuration;
    if (ratio > 0.12) {
      score -= 400;
      reasons.push("源自报时长差 >12% -400");
    }
  }

  if (parsed.hasWordTiming) {
    score += 400;
    reasons.push("带逐字时间轴 +400");
  }

  /*
   * 歌手吻合度。
   *
   * 这一项是「翻唱陷阱」的唯一解药：翻唱版往往标题完全一样、时长也接近，
   * 光靠标题和时长分不出来。实测搜「周杰伦 夜曲」时网易云会把一个翻唱版
   * 排到最前面，加上这一项之后原唱才稳。
   *
   * 不做硬性淘汰：纯音乐/合辑的歌手字段经常是空的或写着一堆人，
   * 一票否决会把这些正常候选误杀。
   */
  {
    const targetArtist = normLoose(target.artist);
    const candidateArtist = normLoose(candidate.artist);
    if (targetArtist && candidateArtist) {
      const matches = candidateArtist.includes(targetArtist) || targetArtist.includes(candidateArtist);
      if (matches) {
        score += 150;
        reasons.push("歌手吻合 +150");
      } else {
        score -= 300;
        reasons.push("歌手不符 -300");
      }
    }
  }

  // 来自当前正在播的播放器同一源，说明身份最可信
  if (candidate.source === "netease" && input.artistMatches) {
    score += 250;
    reasons.push("同源且身份吻合 +250");
  }

  {
    const points = Math.min(200, parsed.lines.length);
    score += points;
    reasons.push(`行数 +${points}`);
  }

  if (versionTagsMismatch(target.title, candidate.title)) {
    score -= 600;
    reasons.push("版本标签不符 -600");
  }

  {
    const albumPoints = albumScore(target.album, candidate.album);
    if (albumPoints >= 200) {
      score += 150;
      reasons.push("专辑完全一致 +150");
    } else if (albumPoints >= 100) {
      score += 75;
      reasons.push("专辑互为子串 +75");
    } else if (albumPoints >= 1) {
      score += 40;
      reasons.push("专辑有共同词元 +40");
    }
  }

  {
    const tier = titleMatchTier(target.title, candidate.title);
    score += tier.points;
    if (tier.points > 0) reasons.push(`${tier.reason} +${tier.points}`);
  }

  if (consensusPeers >= 2) {
    score += 250;
    reasons.push("多源交叉印证 +250");
  } else if (consensusPeers >= 1) {
    score += 150;
    reasons.push("有另一源印证 +150");
  }

  if (parsed.translation.length) {
    score += 50;
    reasons.push("含翻译 +50");
  }

  if (parsed.romanization.length) {
    score += 30;
    reasons.push("含罗马音 +30");
  }

  return { score: Math.max(1, score), reasons, rejected: false };
}
