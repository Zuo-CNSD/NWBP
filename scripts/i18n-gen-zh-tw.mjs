/**
 * 生成繁体中文语言包 `shared/i18n/locales/zh-tw.ts`。
 *
 * 词条的 key 是**简体中文原文**（`t("设置")`），所以繁体包不需要人工翻译，
 * 只要把原文逐条转换成台湾用语的繁体即可 —— 这正是 OpenCC 的 `twp` 方案：
 * 除了字形（设置 → 設定），还做了词汇替换（软件 → 軟體、视频 → 影片、
 * 网络 → 網路、鼠标 → 滑鼠），比单纯转字形自然得多。
 *
 * 两个来源合并成词条全集：
 *   1. `scripts/i18n-catalog.json` —— 所有 `t("…")` 字面量（权威表）；
 *   2. 「动态 key」文件里的中文字面量 —— 这些文案不在 `t("…")` 里直接出现，
 *      而是写在常量表里、渲染时才 `t(表[值])`，扫 t() 抓不到（插件权限标签、
 *      风险级别、音源模式卡片、快捷键名、开发者角色都在这一类）。
 *
 * 转换后与原文相同的条目会被丢掉（「播放」「下载」这种本来就没简化字），
 * 查不到时自动回落原文，不影响显示。
 *
 * 用法：node scripts/i18n-gen-zh-tw.mjs
 * 依赖：opencc-js（devDependency）
 */
import fs from "node:fs";
import path from "node:path";
import { Converter } from "opencc-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "shared", "i18n", "locales", "zh-tw.ts");

/** 渲染时才 `t(表[x])` 的文件 —— 常量表里的中文扫 t() 是扫不到的 */
const DYNAMIC_KEY_FILES = [
  "src/pages/settings/plugin-settings.tsx",
  "src/pages/settings/music-source-settings.tsx",
  "src/pages/settings/shortcut-settings.tsx",
  "src/pages/settings/developers.tsx",
  "src/components/onboarding/index.tsx",
];

const CJK = /[\u4e00-\u9fa5]/;

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "i18n-catalog.json"), "utf-8"));
const keys = new Set(catalog.map(item => item.key));

for (const rel of DYNAMIC_KEY_FILES) {
  const source = fs.readFileSync(path.join(ROOT, rel), "utf-8");
  for (const match of source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
    const value = match[1].replace(/\\"/g, '"');
    if (CJK.test(value) && value.length <= 120) keys.add(value);
  }
}

const toTW = Converter({ from: "cn", to: "twp" });

/** 简中引号在繁体里习惯用「」，顺手换掉；占位符 `{0}` 不受影响 */
const fixQuotes = text => text.replace(/“/g, "「").replace(/”/g, "」").replace(/‘/g, "『").replace(/’/g, "』");

const entries = [];
for (const key of [...keys].sort((a, b) => a.localeCompare(b, "zh"))) {
  if (!CJK.test(key)) continue;
  const converted = fixQuotes(toTW(key));
  if (converted === key) continue;
  entries.push([key, converted]);
}

const body = entries.map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`).join("\n");

const file = `/**
 * 繁体中文（台灣）语言包。
 *
 * **本文件由 \`scripts/i18n-gen-zh-tw.mjs\` 生成，不要手改** ——
 * key 是简体原文，value 由 OpenCC 的 \`twp\` 方案转换而来（字形 + 台湾词汇），
 * 手改的内容下次重新生成会被覆盖。个别译法不合适时，改脚本里的词条映射。
 *
 * 只收录「转换后与原文不同」的条目 —— 简体繁体写法一致的字词
 * （「播放」「下载」）不在表里，查不到时自动回落原文，结果一样。
 * 共 ${entries.length} 条。
 */
const zhTW: Record<string, string> = {
${body}
};

export default zhTW;
`;

fs.writeFileSync(OUT, file);
console.log(`已生成 ${path.relative(ROOT, OUT)}：${entries.length} 条（词条全集 ${keys.size} 条）`);
