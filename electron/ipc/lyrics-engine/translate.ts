import log from "electron-log";
import got from "got";

/**
 * 歌词翻译（移植自 lyrimuse 的 translate.go 降级链，砍掉端上那一级）。
 *
 * lyrimuse 的三级链是：端上翻译（macOS Translation 框架，Go 调不了所以起子进程）
 * → Google → MyMemory。
 * Electron 里第一级完全没法复用，所以这里保留后两级：
 *   Google 的 `translate_a/single` 免 key、无日配额，但属于未公开端点；
 *   挂了就退到 MyMemory（有日配额，所以放兜底）。
 *
 * 翻译结果沿用**主歌词自己的时间戳**逐行生成，不做时间轴对齐 ——
 * 对齐是上层的事，这里只负责「给一批行，还一批译文」。
 */

const GOOGLE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const MYMEMORY_ENDPOINT = "https://api.mymemory.translated.net/get";

/** 单条请求的字符上限：MyMemory 硬限制 460，Google 也会因为太长返回不完整结果 */
const MAX_CHUNK_CHARS = 460;
/** 一首歌最多翻译多少块，防止一首超长歌词把配额打光 */
const MAX_CHUNKS = 40;

const GOOGLE_COOLDOWN_MS = 5 * 60 * 1000;
const MYMEMORY_COOLDOWN_MS = 60 * 60 * 1000;

let googleBlockedUntil = 0;
let myMemoryBlockedUntil = 0;

/** 行文本 → 译文 的进程内缓存，同一首歌来回切时不重复请求 */
const cache = new Map<string, string>();
const cacheKey = (text: string, target: string) => `${target}\u0000${text}`;

const translateByGoogle = async (text: string, target: string) => {
  if (Date.now() < googleBlockedUntil) throw new Error("Google 翻译冷却中");

  const response = await got
    .get(GOOGLE_ENDPOINT, {
      searchParams: { client: "gtx", sl: "auto", tl: target, dt: "t", q: text },
      timeout: { request: 12000 },
      retry: { limit: 1 },
      throwHttpErrors: false,
    })
    .text();

  const parsed = JSON.parse(response) as [Array<[string]> | null];
  const result = (parsed?.[0] ?? []).map(segment => segment?.[0] ?? "").join("");
  if (!result) throw new Error("Google 翻译返回空");

  return result;
};

const translateByMyMemory = async (text: string, target: string) => {
  if (Date.now() < myMemoryBlockedUntil) throw new Error("MyMemory 冷却中");

  const response = await got
    .get(MYMEMORY_ENDPOINT, {
      searchParams: { q: text, langpair: `auto|${target}` },
      timeout: { request: 12000 },
      retry: { limit: 1 },
      throwHttpErrors: false,
    })
    .json<{ responseData?: { translatedText?: string }; responseStatus?: number }>();

  const result = response?.responseData?.translatedText;
  if (!result) throw new Error("MyMemory 返回空");

  return result;
};

interface PendingLine {
  index: number;
  text: string;
}

/** 把待翻译的行合批：一行一个请求太费，但也不能超过单请求上限 */
const chunkLines = (pending: PendingLine[]): PendingLine[][] => {
  const chunks: PendingLine[][] = [];
  let current: PendingLine[] = [];
  let length = 0;

  for (const item of pending) {
    if (item.text.length > MAX_CHUNK_CHARS) {
      // 单行就超限：单独成块，交给服务端自己截断
      if (current.length) chunks.push(current);
      chunks.push([item]);
      current = [];
      length = 0;
      continue;
    }

    if (length + item.text.length + 1 > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = [];
      length = 0;
    }

    current.push(item);
    length += item.text.length + 1;
  }

  if (current.length) chunks.push(current);

  return chunks.slice(0, MAX_CHUNKS);
};

/**
 * 逐行翻译。
 * 返回与输入等长的数组，翻不出来的位置是空串（上层按需隐藏副行）。
 */
export async function translateLines(lines: string[], target = "zh-CN"): Promise<string[]> {
  const result = new Array<string>(lines.length).fill("");

  const pending: PendingLine[] = [];
  lines.forEach((line, index) => {
    const text = line.trim();
    if (!text) return;

    const cached = cache.get(cacheKey(text, target));
    if (cached !== undefined) {
      result[index] = cached;
      return;
    }

    pending.push({ index, text });
  });

  if (!pending.length) return result;

  for (const chunk of chunkLines(pending)) {
    const joined = chunk.map(item => item.text).join("\n");
    let translated: string[] | null = null;

    // 降级链：Google → MyMemory
    for (const attempt of [translateByGoogle, translateByMyMemory]) {
      try {
        const output = await attempt(joined, target);
        translated = output.split("\n");
        break;
      } catch (error) {
        if (attempt === translateByGoogle) {
          googleBlockedUntil = Date.now() + GOOGLE_COOLDOWN_MS;
        } else {
          myMemoryBlockedUntil = Date.now() + MYMEMORY_COOLDOWN_MS;
        }
        log.warn("[lyrics] 翻译降级:", error instanceof Error ? error.message : error);
      }
    }

    if (!translated) continue;

    // 按块内顺序逐行对齐：行数对不上时多出来的丢掉，不硬塞
    chunk.forEach((item, i) => {
      const value = translated?.[i]?.trim();
      if (!value) return;
      result[item.index] = value;
      cache.set(cacheKey(item.text, target), value);
    });
  }

  return result;
}
