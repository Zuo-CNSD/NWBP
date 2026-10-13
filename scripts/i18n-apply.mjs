/**
 * 把源码里**用户可见**的中文包成 `t(...)`。
 *
 * 用 TypeScript 编译器 API 走 AST 改文本位置（不是正则），
 * 因为要精确区分四种位置，它们的改法完全不同：
 *   - JSX 文本 `<span>设置</span>`      → `{t("设置")}`
 *   - JSX 属性 `placeholder="搜索"`      → `placeholder={t("搜索")}`
 *   - 模板串   `` `共 ${n} 首` ``        → `t("共 {0} 首", n)`
 *   - 普通串   `"播放"`                  → `t("播放")`
 *
 * 排除的两类「看着像文案其实不是」：
 *   1. 歌词引擎的词表（`shared/lyrics/**`）—— 那是匹配算法用的数据，
 *      翻成英文会让中文歌词的对唱识别直接失效；
 *   2. 诊断日志（`[lyrics] ...`、`[preload] ...`）—— 只进 electron-log，不进 UI。
 * 另外还有个别 API 参数（网易云 `cat=全部`）和开发者人名，见 EXCLUDE_TEXTS。
 */

import ts from "typescript";

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
/**
 * `--only-templates`：只补「中文出现在插值之后」的模板串。
 *
 * 首轮跑完后剩下这一类：
 *   `` `${v}倍速` ``         head 是空串，中文在第二个 literal 段里；
 *   `` `${n}首歌曲已添加到播放列表` ``
 * 首轮的判断只看 head，所以漏了。第二轮单独收口，避免重复处理已经包好的节点。
 */
const ONLY_TEMPLATES = process.argv.includes("--only-templates");

const DRY_RUN = process.argv.includes("--dry");

const HAN = /[\u4e00-\u9fff]/;

/** 整个目录跳过 */
const EXCLUDE_PREFIXES = [
  "shared/lyrics/",
  "tests/",
  "scripts/",
  "shared/i18n/",
  "node_modules/",
  "dist/",
  ".electron/",
];

/**
 * 单独排除的词条。
 *
 * - 开发者署名是人名，不翻译；
 * - `全部` 是网易云「热门歌单」接口的分类参数，翻译了就查不到歌单；
 * - 歌词引擎的三条是内部抛出的诊断信息。
 */
const EXCLUDE_TEXTS = new Set([
  "会点技术的佳代子",
  "无谬Wumiu",
  "全部",
  "缺少 hash",
  "没有歌词候选",
  "缺少 songmid",
  // 频谱初始化失败的 console.warn，只进 DevTools
  "创建音频分析节点失败：",
]);

/**
 * 整个文件跳过。
 *
 * - 歌词引擎的报错都只进日志；
 * - `shortcut-settings` 的 `name` 是**模块顶层**求值的常量（快捷键表），
 *   在那儿调 `t()` 只会求值一次，之后换语言也不会变。
 *   所以保留中文原文当 key，改在渲染处 `t(item.name)` —— 见设置页快捷键 Tab。
 */
const EXCLUDE_FILES = new Set([
  "electron/ipc/lyrics-engine/sources.ts",
  "electron/ipc/lyrics-engine/index.ts",
  "shared/settings/shortcut-settings.ts",
]);

/**
 * `--only-templates` 模式下再排掉这几个 ——
 * 它们里面的中文已经是「词条 key」而不是待替换的文案了。
 */
const ONLY_TEMPLATES_EXCLUDE = new Set([
  "src/pages/download-list/status-desc.ts",
  "src/pages/home/index.tsx",
  "shared/i18n/index.ts",
]);

const HTML_ENTITIES = [
  [/&nbsp;/g, "\u00a0"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&apos;/g, "'"],
  [/&amp;/g, "&"],
];

const decodeEntities = text => HTML_ENTITIES.reduce((acc, [re, ch]) => acc.replace(re, ch), text);

const collectFiles = () => {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(ROOT, full).split(path.sep).join("/");
      if (EXCLUDE_PREFIXES.some(p => rel.startsWith(p))) continue;
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push({ rel, full });
    }
  };
  for (const d of ["src", "electron", "shared"]) walk(path.join(ROOT, d));
  return out;
};

const keys = new Map();
const touched = [];
let replaced = 0;

for (const { rel, full } of collectFiles()) {
  if (EXCLUDE_FILES.has(rel)) continue;
  if (ONLY_TEMPLATES && ONLY_TEMPLATES_EXCLUDE.has(rel)) continue;

  const original = fs.readFileSync(full, "utf-8");
  const kind = full.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(full, original, ts.ScriptTarget.Latest, true, kind);

  /** { start, end, text } */
  const edits = [];
  /** 已被「整段合并」吃掉的子节点起点，主遍历要跳过它们 */
  const consumed = new Set();

  const push = (start, end, text, key) => {
    edits.push({ start, end, text });
    if (!keys.has(key)) keys.set(key, { key, files: [] });
    keys.get(key).files.push(`${rel}:${source.getLineAndCharacterOfPosition(start).line + 1}`);
    replaced += 1;
  };

  /**
   * 把「文字 + 变量」混排的一串 JSX 子节点合成**一条**词条。
   *
   * 不合成的话 `搜索【{keyword}】的结果` 会被拆成 `搜索【` 和 `】的结果` 两条，
   * 英文里语序完全不同（"Search results for 【x】"），拆开根本翻不对。
   * 合成后是一条带占位符的整句：`t("搜索【{0}】的结果", keyword)`。
   *
   * 三种情况不合并、退回逐节点处理：
   *   - 中间夹着真正的换行（JSX 的空白折叠规则会让模板串和实际渲染对不上）；
   *   - 变量本身又含中文（那它自己有嵌套文案，合并会把它吞掉）；
   *   - 变量是 JSX 元素（那是结构不是文案）。
   */
  const mergeRuns = element => {
    const children = element.children ?? [];
    let run = [];

    const flush = () => {
      if (run.length >= 2) {
        const hasText = run.some(c => ts.isJsxText(c) && HAN.test(c.text));
        const hasExpr = run.some(c => ts.isJsxExpression(c));
        if (hasText && hasExpr) {
          const start = run[0].getStart(source);
          const end = run.at(-1).getEnd();
          const slice = original.slice(start, end);
          const lead = slice.match(/^\s*/)[0];
          const tail = slice.match(/\s*$/)[0];
          const body = slice.slice(lead.length, slice.length - tail.length);

          if (!body.includes("\n")) {
            let template = "";
            const args = [];
            for (const [i, child] of run.entries()) {
              if (ts.isJsxText(child)) {
                let textPart = original.slice(child.getStart(source), child.getEnd());
                if (i === 0) textPart = textPart.replace(/^\s+/, "");
                if (i === run.length - 1) textPart = textPart.replace(/\s+$/, "");
                template += decodeEntities(textPart);
              } else {
                args.push(child.expression.getText(source));
                template += `{${args.length - 1}}`;
              }
            }
            if (!args.some(a => HAN.test(a)) && HAN.test(template)) {
              push(start, end, `${lead}{t(${JSON.stringify(template)}, ${args.join(", ")})}${tail}`, template);
              for (const child of run) consumed.add(child.getStart(source));
            }
          }
        }
      }
      run = [];
    };

    for (const child of children) {
      if (ts.isJsxText(child) || (ts.isJsxExpression(child) && child.expression)) run.push(child);
      else flush();
    }
    flush();

    ts.forEachChild(element, visit);
  };

  const visit = node => {
    if (consumed.has(node.getStart(source))) return;

    if (!ONLY_TEMPLATES && (ts.isJsxElement(node) || ts.isJsxFragment(node))) {
      mergeRuns(node);
      return;
    }

    // ---- JSX 文本节点
    if (!ONLY_TEMPLATES && ts.isJsxText(node)) {
      const start = node.getStart(source);
      const end = node.getEnd();
      const raw = original.slice(start, end);
      if (HAN.test(raw)) {
        const lead = raw.length - raw.trimStart().length;
        const core = raw.trim();
        if (core && HAN.test(core)) {
          const trimmed = decodeEntities(core);
          if (!EXCLUDE_TEXTS.has(trimmed)) {
            push(start + lead, end - (raw.length - lead - core.length), `{t(${JSON.stringify(trimmed)})}`, trimmed);
          }
        }
      }
    }
    // ---- 字符串字面量 / 无插值模板串
    else if (!ONLY_TEMPLATES && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
      const parent = node.parent;
      const isName =
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isPropertySignature(parent) && parent.name === node) ||
        (ts.isEnumMember(parent) && parent.name === node) ||
        ts.isImportSpecifier(parent) ||
        ts.isExportSpecifier(parent) ||
        ts.isImportDeclaration(parent) ||
        ts.isExportDeclaration(parent) ||
        (ts.isJsxAttribute(parent) && parent.name === node) ||
        ts.isModuleDeclaration(parent);

      const text = node.text;
      if (!isName && HAN.test(text) && text.trim() && !EXCLUDE_TEXTS.has(text) && !text.startsWith("[")) {
        // 已经在 t(...) 里的跳过，保证脚本可重复执行
        const wrapped =
          ts.isCallExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === "t";
        if (!wrapped) {
          const isAttrValue = ts.isJsxAttribute(parent);
          const replacement = isAttrValue ? `{t(${JSON.stringify(text)})}` : `t(${JSON.stringify(text)})`;
          push(node.getStart(source), node.getEnd(), replacement, text);
        }
      }
    }
    // ---- 带插值的模板串 → {0} 占位
    else if (ts.isTemplateExpression(node)) {
      // 整串拼起来找中文：中文可能落在插值之后的段里（`` `${v}倍速` ``）
      const cooked = node.head.text + node.templateSpans.map(s => s.literal.text).join("");
      if (HAN.test(cooked) && !cooked.startsWith("[")) {
        const wrapped =
          ts.isCallExpression(node.parent) &&
          ts.isIdentifier(node.parent.expression) &&
          node.parent.expression.text === "t";
        if (!wrapped) {
          let template = node.head.text;
          const args = [];
          for (const span of node.templateSpans) {
            args.push(span.expression.getText(source));
            template += `{${args.length - 1}}${span.literal.text}`;
          }
          if (!EXCLUDE_TEXTS.has(template) && !args.some(a => HAN.test(a))) {
            push(node.getStart(source), node.getEnd(), `t(${JSON.stringify(template)}, ${args.join(", ")})`, template);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(source);

  if (!edits.length) continue;

  // 从后往前改，避免位置偏移
  let next = original;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  }

  // 补 import
  if (!next.includes("common/i18n") && !next.includes('"./i18n"') && !next.includes('"../i18n"')) {
    const importPath = rel.startsWith("src/")
      ? "@/common/i18n"
      : (() => {
          const from = path.dirname(full);
          const target = path.join(ROOT, "electron", "i18n");
          let p = path.relative(from, target).split(path.sep).join("/");
          if (!p.startsWith(".")) p = `./${p}`;
          return p;
        })();

    const statements = next.match(/^import[\s\S]*?;$/gm);
    const last = statements ? statements[statements.length - 1] : null;
    const line = `\nimport { t } from ${JSON.stringify(importPath)};`;
    if (last) {
      const at = next.indexOf(last) + last.length;
      next = next.slice(0, at) + line + next.slice(at);
    } else {
      next = `import { t } from ${JSON.stringify(importPath)};\n\n${next}`;
    }
  }

  touched.push({ rel, count: edits.length });
  if (!DRY_RUN) fs.writeFileSync(full, next);
}

const unique = [...keys.values()].sort((a, b) => a.key.localeCompare(b.key, "zh"));
const suffix = ONLY_TEMPLATES ? "-tpl" : "";
fs.writeFileSync(
  path.join(ROOT, "scripts", `i18n-keys${suffix}.json`),
  `${JSON.stringify(
    unique.map(k => k.key),
    null,
    2,
  )}\n`,
);
fs.writeFileSync(path.join(ROOT, "scripts", `i18n-keys-detail${suffix}.json`), `${JSON.stringify(unique, null, 2)}\n`);

console.log(`改动文件: ${touched.length}`);
console.log(`替换处数: ${replaced}`);
console.log(`去重词条: ${unique.length}`);
console.log(`最大 15 个文件:`);
for (const f of touched.sort((a, b) => b.count - a.count).slice(0, 15)) console.log(String(f.count).padStart(4), f.rel);
