/**
 * 对唱分角色（移植自 lyrimuse 的 LyricDuet）。
 *
 * 中文歌的歌词里经常写 `男：……` / `女：……` / `合：……`，
 * 也有用 `ttm:agent="v1"` 这种匿名声部的。目标是把这些标记变成「谁在唱」，
 * 渲染时左右分列，同时把前缀从歌词正文里剥掉。
 *
 * 难点在于「怎么知道一个标签真的是人名/声部」——
 * 歌词里 `作词：周杰伦`、`吉他：阿伟` 也是「标签+冒号」的形状。
 * 所以用两道闸：已知声部词直接认；未知标签必须能在整首里形成「稳定的多方对唱证据」。
 */

/** 合唱类标记：归一类，不参与左右分边 */
const CHORUS_LABELS = new Set([
  "合",
  "合唱",
  "全体",
  "齐唱",
  "齐",
  "所有人",
  "大家一起",
  "一起",
  "chorus",
  "all",
  "everyone",
  "both",
  "duet",
  "together",
]);

const MALE_LABELS = new Set(["男", "男生", "男声", "男合", "男性", "m", "male", "man"]);
const FEMALE_LABELS = new Set(["女", "女生", "女声", "女合", "女性", "f", "female", "woman"]);

/** 这些词是虚词/代词，不会是演唱者名 */
const NON_NAME_WORDS = new Set([
  "我",
  "你",
  "他",
  "她",
  "它",
  "我们",
  "你们",
  "他们",
  "谁",
  "这",
  "那",
  "这里",
  "那里",
  "什么",
  "为什么",
  "因为",
  "所以",
  "但是",
  "可是",
  "如果",
  "时候",
  "现在",
  "以后",
  "以前",
  "一起",
  "一个人",
]);

/** 乐器 / 职能词根：带这些的标签是制作信息，不是演唱者 */
const ROLE_ROOTS = [
  "吉他",
  "贝斯",
  "鼓",
  "键盘",
  "钢琴",
  "提琴",
  "笛",
  "萨克斯",
  "小号",
  "长号",
  "和声",
  "伴唱",
  "编曲",
  "作词",
  "作曲",
  "填词",
  "混音",
  "母带",
  "录音",
  "制作",
  "监制",
  "出品",
  "发行",
  "企划",
  "宣传",
  "封面",
  "设计",
  "演奏",
  "调教",
  "调校",
  "后期",
  "剪辑",
  "摄影",
  "导演",
  "监修",
];

const normalizeLabel = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]/g, "");

/**
 * 拆出「标签 + 冒号」。
 * 标签里不允许出现空白或标点，长度不超过 10 —— 否则会把
 * `他说：我不在乎` 这种正文当成对唱标记。
 */
export function splitSpeakerLabel(text: string): { label: string; rest: string } | null {
  const match = text.match(/^([^：:\s\u3000]{1,10})\s*[：:]\s*([\s\S]*)$/);
  if (!match) return null;

  const label = normalizeLabel(match[1]);
  if (!label) return null;
  // 纯数字 / 纯符号不是演唱者
  if (!/[\p{L}\p{Script=Han}]/u.test(label)) return null;

  return { label, rest: match[2] };
}

/** 声部身份：同一身份的人不会被分到两边 */
const identityOf = (label: string): string => {
  if (CHORUS_LABELS.has(label)) return "chorus";
  if (MALE_LABELS.has(label)) return "male";
  if (FEMALE_LABELS.has(label)) return "female";
  return `name:${label}`;
};

const isKnownVocalWord = (label: string) =>
  CHORUS_LABELS.has(label) || MALE_LABELS.has(label) || FEMALE_LABELS.has(label);

/** 未知标签是否有资格当人名 */
const plausibleSpeakerName = (label: string) => {
  if (NON_NAME_WORDS.has(label)) return false;
  if (ROLE_ROOTS.some(root => label.includes(root))) return false;
  // 一个字的标签只认已知声部词（「谁/他」这类已经被上面的表挡掉）
  if (label.length === 1 && !isKnownVocalWord(label)) return false;
  return true;
};

interface DuetPlanLine {
  timeMs: number;
  text: string;
  words?: LyricWord[];
}

interface DuetPlanEntry {
  side: LyricDuetSide | null;
  /** 需要从正文里剥掉的字符数 */
  stripChars: number;
  text: string;
  words?: LyricWord[];
}

/**
 * 统计整首里出现过的标签，决定哪些算演唱者。
 *
 * 判据（照搬 lyrimuse）：已知声部词直接放行；未知标签要同时满足
 * ① 至少 2 个不同标签 ② 总出现次数 ≥3 ③ 至少有一个重复出现 ≥2 次。
 * 这三条一起才能排除「作词：xxx」这种只出现一次的署名行。
 */
const collectSpeakers = (labels: string[]) => {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);

  const accepted: string[] = [];
  for (const label of counts.keys()) {
    if (isKnownVocalWord(label)) {
      accepted.push(label);
      continue;
    }
    if (!plausibleSpeakerName(label)) continue;
    accepted.push(label);
  }

  const unknown = accepted.filter(label => !isKnownVocalWord(label));
  const hasRepeatedUnknown = unknown.some(label => (counts.get(label) ?? 0) >= 2);
  const evidenceEnough =
    (counts.size >= 2 && labels.length >= 3 && (unknown.length === 0 || hasRepeatedUnknown)) || unknown.length >= 2;

  if (!evidenceEnough) {
    // 证据不足时只保留已知声部词
    return new Set(accepted.filter(isKnownVocalWord));
  }

  return new Set(accepted);
};

/**
 * 给每行定边。
 * 只出现一个独唱身份时不启用对唱排版（避免单人歌 / 纯合唱被误分左右）。
 */
export function planDuet(lines: DuetPlanLine[]): DuetPlanEntry[] {
  const labels: string[] = [];
  const parsed = lines.map(line => {
    const split = splitSpeakerLabel(line.text);
    if (split) labels.push(split.label);
    return split;
  });

  const speakers = collectSpeakers(labels);

  // 按首次出现顺序给独唱身份定左右
  const order: string[] = [];
  for (const split of parsed) {
    if (!split || !speakers.has(split.label)) continue;
    const identity = identityOf(split.label);
    if (identity === "chorus") continue;
    if (!order.includes(identity)) order.push(identity);
  }

  const hasEnoughIdentities = order.length >= 2;

  const entries: DuetPlanEntry[] = [];
  let currentSide: LyricDuetSide | null = null;

  lines.forEach((line, index) => {
    const split = parsed[index];

    if (split && speakers.has(split.label)) {
      const identity = identityOf(split.label);
      if (identity === "chorus") {
        currentSide = "center";
      } else if (hasEnoughIdentities) {
        // 第 1 位在左（leading），第 2 位在右（trailing），第 3 位回到左，以此类推
        currentSide = order.indexOf(identity) % 2 === 0 ? "leading" : "trailing";
      } else {
        currentSide = null;
      }

      entries.push({
        side: currentSide,
        stripChars: line.text.length - split.rest.length,
        text: split.rest,
        words: line.words ? stripWordsPrefix(line.words, line.text.length - split.rest.length) : undefined,
      });
      return;
    }

    // 没有新标记时沿用上一个声部（标记向后延续）
    entries.push({
      side: hasEnoughIdentities || currentSide ? currentSide : null,
      stripChars: 0,
      text: line.text,
      words: line.words,
    });
  });

  return entries;
}

/**
 * 按字符数从前端剥掉前缀。
 * 逐字歌词要保住时间戳：剥到一半的词只改文本、保留原时间，
 * 否则 `男：周` 里的「周」会丢掉它的起始时间。
 */
export function stripWordsPrefix(words: LyricWord[], charCount: number): LyricWord[] {
  if (charCount <= 0) return words;

  const out: LyricWord[] = [];
  let remaining = charCount;

  for (const word of words) {
    if (remaining <= 0) {
      out.push({ ...word });
      continue;
    }

    if (word.text.length <= remaining) {
      remaining -= word.text.length;
      continue;
    }

    out.push({ ...word, text: word.text.slice(remaining) });
    remaining = 0;
  }

  return out;
}
