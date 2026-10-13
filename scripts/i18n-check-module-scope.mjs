import ts from "typescript";

/**
 * 找出**模块顶层**求值的 `t(...)`。
 *
 * 这类调用只在 import 那一刻执行一次，之后换语言不会重新求值 ——
 * 表现是「设置里切了英文，侧栏菜单还是中文」。
 * 必须改成「函数按需生成」或者「渲染处再 t()」。
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

const hits = [];
for (const { rel, full } of files) {
  const source = ts.createSourceFile(
    full,
    fs.readFileSync(full, "utf-8"),
    ts.ScriptTarget.Latest,
    true,
    full.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node, depth) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t" && depth === 0) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      hits.push({ rel, line: line + 1, text: node.arguments[0]?.getText(source)?.slice(0, 60) ?? "" });
    }
    ts.forEachChild(node, c => visit(c, ts.isFunctionLike(node) ? depth + 1 : depth));
  };
  visit(source, 0);
}

for (const h of hits) console.log(`${h.rel}:${h.line}  t(${h.text})`);
console.log(`\n共 ${hits.length} 处模块顶层调用，涉及 ${new Set(hits.map(h => h.rel)).size} 个文件`);
