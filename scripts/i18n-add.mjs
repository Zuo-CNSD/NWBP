import ts from "typescript";

/**
 * 往 en / ja / ko 三个语言包里补词条。
 *
 * 用法：node scripts/i18n-add.mjs <additions.json>
 *
 * additions.json 形如：
 *   { "词条原文": { "en": "…", "ja": "…", "ko": "…" } }
 *
 * 为什么要有这个脚本：词条表是按中文排序的，手插容易插错位置、也容易漏掉某一门语言；
 * 而且漏翻译不会报错（只会静默回落中文），所以「三份一起写、一次插对」比事后查便宜。
 *
 * 插完记得跑 `node scripts/i18n-gen-zh-tw.mjs` 让繁体包跟上，
 * 再跑 `npx vitest run tests/i18n.test.ts` 验占位符和空译文。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = process.argv[2];
if (!source) {
  console.error("用法：node scripts/i18n-add.mjs <additions.json>");
  process.exit(1);
}

const additions = JSON.parse(fs.readFileSync(source, "utf-8"));
const TARGETS = ["en", "ja", "ko"];

for (const language of TARGETS) {
  const file = path.join(ROOT, "shared", "i18n", "locales", `${language}.ts`);
  const text = fs.readFileSync(file, "utf-8");
  const file_ = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  // 用 AST 而不是正则：日文包里有跨行的长条目，按行切会把它们切断
  const props = [];
  const visit = node => {
    if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.parent)) {
      const name = node.name;
      const key = ts.isStringLiteral(name) || ts.isIdentifier(name) ? name.text : null;
      if (key !== null) props.push({ key, start: node.getStart(file_, false) });
    }
    ts.forEachChild(node, visit);
  };
  visit(file_);

  const existing = new Set(props.map(prop => prop.key));
  const lines = text.split("\n");
  const inserts = [];
  let skipped = 0;

  for (const [key, translations] of Object.entries(additions)) {
    const value = translations[language];
    if (!value) {
      console.warn(`${language}: 「${key}」没有译文，跳过`);
      continue;
    }
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }

    const line = `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`;
    // 插在第一条排在自己后面的词条之前，保持整份文件仍按中文排序
    const next = props.find(prop => prop.key.localeCompare(key, "zh") > 0);
    const lineNo = next
      ? file_.getLineAndCharacterOfPosition(next.start).line
      : lines.findLastIndex(one => one.trim() === "};");

    inserts.push({ lineNo, line });
  }

  inserts.sort((a, b) => b.lineNo - a.lineNo);
  for (const { lineNo, line } of inserts) lines.splice(lineNo, 0, line);

  fs.writeFileSync(file, lines.join("\n"));
  console.log(`${language}: +${inserts.length}${skipped ? `（已存在 ${skipped} 条，跳过）` : ""}`);
}
