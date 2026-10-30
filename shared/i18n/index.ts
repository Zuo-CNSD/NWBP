/**
 * 轻量国际化内核（主进程 + 渲染进程共用）。
 *
 * 设计取舍：**用中文原文当 key**，而不是另起一套 `settings.title` 这类键名。
 *   1. 这个项目原本全是硬编码中文，抽文案时不用再发明 800 多个键名，
 *      也就不会有「键名和文案对不上」这类低级错；
 *   2. 词典里缺哪条就自动回落到中文，**永远不会出现空白界面** ——
 *      新增文案忘了翻译只是显示中文，不是显示 undefined；
 *   3. 代码可读性反而更好：`t("播放")` 一眼知道是什么。
 *
 * 代价是同名不同义的词共用一条翻译（比如「设置」在标题和菜单里），
 * 在这个项目里没有歧义，可以接受。
 *
 * 参数用 `{0}` `{1}` 占位：`t("共 {0} 首", count)`。
 * 占位替换**对回落的原文也生效**，所以中文包可以是空的。
 */

import en from "./locales/en";
import ja from "./locales/ja";
import ko from "./locales/ko";
import zhTW from "./locales/zh-tw";

export const LANGUAGES = ["zh-CN", "zh-TW", "en", "ja", "ko"] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "zh-CN";

/** 语言选择器里显示的名字。用各自的语言写，用户扫一眼就能认出自己的母语。 */
export const LANGUAGE_LABELS: Record<Language, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
};

type Messages = Record<string, string>;

/**
 * 中文是**基准语言**，不存词典：查不到就原样返回 key，而 key 本身就是中文。
 * 这样中文包不用维护，也不会出现「改了中文没改词典」的不一致。
 *
 * 繁体包是例外：它的 key 也是简体原文，值才是繁体（由 `scripts/i18n-gen-zh-tw.mjs`
 * 生成）。所以繁体界面缺词条时显示的是简体，不会掉回英文 —— 对读者来说更好读。
 */
const PACKS: Record<Language, Messages> = {
  "zh-CN": {},
  "zh-TW": zhTW,
  en,
  ja,
  ko,
};

/**
 * 把拿到的值收敛成一个受支持的语言。
 *
 * 要容错是因为这个值可能来自老版本的配置文件、系统语言（`zh-Hans-CN`）、
 * 或者用户手改过的 json —— 任何一个不认识的值都不该让界面变成空白。
 */
export const normalizeLanguage = (value?: null | string): Language => {
  if (!value) return DEFAULT_LANGUAGE;
  if ((LANGUAGES as readonly string[]).includes(value)) return value as Language;

  const lower = value.toLowerCase();

  /*
   * 中文得先分清简繁，不能走下面的 base 匹配：
   * `zh-Hant` / `zh-TW` / `zh-HK` / `zh-MO` 都该是繁体，
   * 而按 base（`zh`）去 find 会一律命中排在前面的 `zh-CN`。
   */
  if (lower.startsWith("zh")) {
    return /hant|tw|hk|mo/.test(lower) ? "zh-TW" : "zh-CN";
  }

  // `en-US` → `en`、`ja-JP` → `ja`
  const base = lower.split("-")[0];
  const matched = LANGUAGES.find(l => l.toLowerCase() === lower || l.toLowerCase().split("-")[0] === base);

  return (matched as Language) ?? DEFAULT_LANGUAGE;
};

const substitute = (template: string, args: readonly unknown[]): string => {
  if (!args.length) return template;
  return template.replace(/\{(\d+)\}/g, (raw, index: string) => {
    const value = args[Number(index)];
    return value === undefined || value === null ? raw : String(value);
  });
};

/**
 * 取词。
 *
 * 词典里没有这条 → 返回 `key` 本身（中文原文），再套占位替换。
 */
export const translate = (language: Language, key: string, ...args: unknown[]): string => {
  const text = PACKS[normalizeLanguage(language)][key] ?? key;
  return substitute(text, args);
};

/** 某个语言包里有多少条翻译，设置页用来展示「已翻译多少」 */
export const countMessages = (language: Language): number => Object.keys(PACKS[normalizeLanguage(language)]).length;
