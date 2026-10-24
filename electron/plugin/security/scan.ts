import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { COMBINED_RULE, CREDENTIAL_PATTERNS, SCAN_RULES, SINK_PATTERNS } from "./rules";

/**
 * 插件静态扫描。
 *
 * 只读文件、只做文本匹配，**不执行插件任何代码** —— 这一点很重要：
 * 一个设计用来偷 Cookie 的插件，在「扫描」阶段不应该有机会跑起来。
 *
 * 组合判定是这套东西的核心：单独看 `fetch` 是正常联网，单独看 `document.cookie`
 * 可能是无害的文档引用，但**同一个插件里既读凭据又往外发**，性质就变了。
 */

const MAX_SCAN_BYTES = 1024 * 1024;
const EVIDENCE_MAX = 140;

const levelWeight: Record<PluginRiskLevel, number> = { safe: 0, low: 1, medium: 2, high: 3, critical: 4 };

const readIfText = (file: string): string | null => {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_SCAN_BYTES) return null;
    return fs.readFileSync(file, "utf-8");
  } catch {
    return null;
  }
};

/** 第 index 个字符在第几行（1 起） */
const lineOf = (text: string, index: number) => {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
};

const clip = (raw: string) => {
  const flat = raw.replace(/\s+/g, " ").trim();
  return flat.length > EVIDENCE_MAX ? `${flat.slice(0, EVIDENCE_MAX)}…` : flat;
};

/** 收集某个文件里所有规则的命中 */
const matchRules = (file: string, kind: "main" | "renderer" | "styles" | "manifest", text: string) => {
  const findings: PluginFinding[] = [];

  for (const rule of SCAN_RULES) {
    if (rule.scope && !rule.scope.includes(kind)) continue;

    for (const pattern of rule.patterns) {
      // matchAll 会克隆正则，不会污染共享实例的 lastIndex
      for (const match of text.matchAll(pattern)) {
        const index = match.index ?? 0;
        findings.push({
          rule: rule.id,
          level: rule.level,
          file,
          line: lineOf(text, index),
          evidence: clip(match[0]),
          blocking: rule.blocking === true,
        });
      }
    }
  }

  return findings;
};

const hasAny = (text: string, patterns: RegExp[]) => patterns.some(pattern => text.match(pattern) !== null);

/**
 * 扫一遍插件目录，返回结论。
 *
 * `files` 里的键是「manifest 里声明的相对路径」，值是文件类型 ——
 * 只扫插件自己声明会被加载的文件，扫别的没有意义（也不会被加载）。
 */
export function scanPluginFolder(
  folder: string,
  files: { name: string; kind: "main" | "renderer" | "styles" | "manifest" }[],
): PluginScanResult {
  const findings: PluginFinding[] = [];
  const scannedFiles: string[] = [];
  const digest = createHash("sha1");
  let credentialFile = "";
  let sinkFile = "";

  for (const item of files) {
    const full = path.join(folder, item.name);
    const text = readIfText(full);
    if (text === null) continue;

    scannedFiles.push(item.name);
    digest.update(item.name).update("\0").update(text).update("\0");

    findings.push(...matchRules(item.name, item.kind, text));

    // 组合判定按文件粒度：同一个文件里既读又发，基本可以定性
    if (!credentialFile && hasAny(text, CREDENTIAL_PATTERNS)) credentialFile = item.name;
    if (!sinkFile && hasAny(text, SINK_PATTERNS)) sinkFile = item.name;
  }

  if (credentialFile && sinkFile) {
    findings.push({
      rule: COMBINED_RULE.id,
      level: COMBINED_RULE.level,
      file: credentialFile === sinkFile ? credentialFile : `${credentialFile} → ${sinkFile}`,
      line: 0,
      evidence: `同时命中凭据读取（${credentialFile}）与网络外发（${sinkFile}）`,
      blocking: COMBINED_RULE.blocking,
    });
  }

  const level = findings.reduce<PluginRiskLevel>(
    (worst, finding) => (levelWeight[finding.level] > levelWeight[worst] ? finding.level : worst),
    "safe",
  );

  return {
    level,
    blocked: findings.some(finding => finding.blocking),
    findings: dedupe(findings),
    scannedFiles,
    scannedAt: Date.now(),
    digest: digest.digest("hex"),
  };
}

/** 同一文件同一行同一规则只留一条，避免一个循环里的十次 fetch 刷屏 */
const dedupe = (findings: PluginFinding[]) => {
  const seen = new Set<string>();
  return findings
    .filter(finding => {
      const key = `${finding.rule}|${finding.file}|${finding.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => levelWeight[b.level] - levelWeight[a.level] || a.line - b.line);
};
