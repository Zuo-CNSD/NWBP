import ts from "typescript";

/**
 * 从源码里反查所有 `t("...")` 的第一个参数，生成**权威词条表**。
 *
 * 比正向提取可靠：不管文案是这轮脚本包的还是手改的，只要最终形态是 `t(...)`
 * 就一定在里面；反过来，没被包成 `t(...)` 的中文（词表、开发者人名、日志）
 * 也不会混进来。
 *
 * 顺带把「中文原文当 key 但没写 t()」的两张表（下载状态、问候语）也收进来 ——
 * 它们是在渲染处才 `t()` 的。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SKIP = ["node_modules", "dist", ".electron", "scripts", "tests"];

const files = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).split(path.sep).join("/");
    if (SKIP.some(s => rel.startsWith(`${s}/`))) continue;
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry.name)) files.push({ rel, full });
  }
};
for (const d of ["src", "electron", "shared"]) walk(path.join(ROOT, d));

const keys = new Map();
for (const { rel, full } of files) {
  const source = ts.createSourceFile(
    full,
    fs.readFileSync(full, "utf-8"),
    ts.ScriptTarget.Latest,
    true,
    full.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
      const first = node.arguments[0];
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        const list = keys.get(first.text) ?? [];
        list.push(`${rel}:${line + 1}`);
        keys.set(first.text, list);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const sorted = [...keys.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh"));
const out = sorted.map(([key, where]) => ({ key, where }));
fs.writeFileSync(path.join(ROOT, "scripts", "i18n-catalog.json"), `${JSON.stringify(out, null, 2)}\n`);
fs.writeFileSync(path.join(ROOT, "scripts", "i18n-catalog-keys.txt"), `${sorted.map(([k]) => k).join("\n")}\n`);

/* 顺带查一遍 t() 的实参个数，防止漏占位符 */
let multi = 0;
for (const { full } of files) {
  const src = fs.readFileSync(full, "utf-8");
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
    if (m[1].includes("{0}") || m[1].includes("{1}")) multi += 1;
  }
}

console.log(`词条总数: ${sorted.length}`);
console.log(`带占位符的调用处: ${multi}`);
console.log(`覆盖文件: ${new Set(out.flatMap(o => o.where)).size} 处调用点`);
