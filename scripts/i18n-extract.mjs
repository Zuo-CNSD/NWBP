import ts from "typescript";

/**
 * 抽取所有可能「用户可见」的中文字符串，输出 JSON 报告。
 *
 * 用 TypeScript 编译器 API 走 AST（不是正则），因为要准确拿到
 * 「这个字面量到底在 JSX 文本位、还是 JSX 属性值、还是普通调用参数里」。
 * 正则分不清这三种，会把注释和模板串搞混。
 */
import fs from "node:fs";
import path from "node:path";

const HAN = /[\u4e00-\u9fff]/;
const ROOT = path.resolve(import.meta.dirname, "..");

/** 这些目录里的中文是**算法数据**（歌词对唱识别词表等），翻译了就废了 */
const EXCLUDE_DIRS = ["node_modules", ".git", "dist", ".electron", "release", "shared/lyrics", "tests", "scripts"];

const SCAN_DIRS = ["src", "electron", "shared"];

const files = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    if (EXCLUDE_DIRS.some(d => rel === d || rel.startsWith(`${d}${path.sep}`))) continue;
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
};
for (const d of SCAN_DIRS) walk(path.join(ROOT, d));

const report = [];
const seen = new Set();

for (const file of files) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf-8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const rel = path.relative(ROOT, file);

  const visit = (node, funcDepth) => {
    const nextDepth = ts.isFunctionLike(node) ? funcDepth + 1 : funcDepth;

    if (ts.isJsxText(node)) {
      const text = node.text;
      if (HAN.test(text)) {
        const core = text.trim();
        if (core && HAN.test(core)) {
          record(rel, node, "jsx", core, funcDepth === 0, source);
        }
      }
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      const isPropName =
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isPropertySignature(parent) && parent.name === node) ||
        (ts.isEnumMember(parent) && parent.name === node) ||
        ts.isImportSpecifier(parent) ||
        ts.isExportSpecifier(parent) ||
        ts.isImportDeclaration(parent) ||
        ts.isExportDeclaration(parent) ||
        (ts.isJsxAttribute(parent) && parent.name === node) ||
        ts.isModuleDeclaration(parent);
      if (!isPropName && HAN.test(node.text) && node.text.trim()) {
        const kind = ts.isJsxAttribute(parent) ? "jsxattr" : "str";
        record(rel, node, kind, node.text, funcDepth === 0, source);
      }
    } else if (ts.isTemplateExpression(node)) {
      const raw = node.getText(source);
      if (HAN.test(raw) && !raw.includes("\n")) {
        record(rel, node, "tpl", raw, funcDepth === 0, source);
      }
    }

    ts.forEachChild(node, c => visit(c, nextDepth));
  };

  // 跳过已被 t(...) 包裹的（幂等）
  const record = (relPath, node, kind, text, moduleScope, src) => {
    const wrapped =
      ts.isCallExpression(node.parent) &&
      ts.isIdentifier(node.parent.expression) &&
      node.parent.expression.text === "t";
    if (wrapped) return;
    const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
    const key = `${relPath}|${kind}|${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    report.push({ file: relPath, line: line + 1, kind, text, moduleScope });
  };

  visit(source, 0);
}

report.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));

const out = path.join(ROOT, "scripts", "i18n-strings.json");
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

const uniqTexts = new Map();
for (const r of report) if (!uniqTexts.has(r.text)) uniqTexts.set(r.text, r);

console.log(`文件数: ${new Set(report.map(r => r.file)).size}`);
console.log(`条目总数: ${report.length}`);
console.log(`去重后待翻译词条: ${uniqTexts.size}`);
console.log(`模块顶层（重挂载不会刷新）条目: ${report.filter(r => r.moduleScope).length}`);
const byKind = {};
for (const r of report) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
console.log("按位置:", byKind);
console.log("按文件（前 40）:");
const perFile = {};
for (const r of report) perFile[r.file] = (perFile[r.file] ?? 0) + 1;
for (const [f, n] of Object.entries(perFile)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 40))
  console.log(String(n).padStart(4), f);
