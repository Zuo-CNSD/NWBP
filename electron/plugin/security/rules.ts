/**
 * 插件静态扫描规则表。
 *
 * 规则写得克制一点是有意的：**误报比漏报更毁体验**。
 * 一个只想改个颜色的插件如果被标成「高风险」，用户下次就不看提示了，
 * 整套机制等于失效。所以：
 *   - 单纯用 `fetch` 不算问题（插件联网是正常需求）；
 *   - 只有「读凭据」和「把东西发出去」**同时出现**才升级为外传；
 *   - 形如 `cookie` 这种词本身不算，必须是要点（`document.cookie`、`MUSIC_U` 等）。
 */

interface ScanRuleDef {
  id: string;
  level: PluginRiskLevel;
  /** 命中即拒绝加载。只给「确定没有正当理由」的行为用 */
  blocking?: boolean;
  /** 只在这些文件类型里检查；不填表示都查 */
  scope?: ("main" | "renderer" | "styles" | "manifest")[];
  patterns: RegExp[];
}

/**
 * 凭据特征。**这组只用于「判断有没有碰凭据」，单独命中不一定拦** ——
 * 比如一个插件在文档字符串里提到 `MUSIC_U`，那是无害的。
 * 真正确认外传要配合 `SINK_PATTERNS`（见 scan.ts 的组合逻辑）。
 */
export const CREDENTIAL_PATTERNS: RegExp[] = [
  /document\s*\.\s*cookie/gi,
  /\bMUSIC_U\b/g,
  /\bSESSDATA\b/g,
  /\bbili_jct\b/g,
  /\bDedeUserID\b/g,
  /__csrf/gi,
  /\bAuthorization\s*[:=]\s*['"`]/gi,
  /localStorage\s*\.\s*(?:getItem|setItem)\s*\(\s*['"`][^'"`]*(?:user-login|login-info|token|credential|auth)/gi,
  /nwbp\s*:\s*user/gi,
];

/** 把数据送出去的通道。单独命中是正常行为，和凭据同现才拦 */
export const SINK_PATTERNS: RegExp[] = [
  /\bfetch\s*\(/g,
  /\bXMLHttpRequest\b/g,
  /\bnew\s+WebSocket\b/g,
  /\bsendBeacon\s*\(/g,
  /\bnew\s+Image\s*\(\s*\)/g,
  /\.src\s*=\s*['"`]https?:/gi,
  /https?:\/\/[^\s'"`]*\?[^\s'"`]*=/g,
];

/**
 * 独立规则。
 *
 * `blocking` 只给三条：读 Node 文件/子进程能力、读凭据并无任何声明、密码框抓取。
 * 其余一律降级为提示 —— 让用户自己判断，而不是替他把插件全禁了。
 */
export const SCAN_RULES: ScanRuleDef[] = [
  {
    id: "node-escape",
    level: "critical",
    blocking: true,
    scope: ["main", "renderer"],
    // 插件要文件读写请走 ctx.fs（限定在自己目录内），直接 require fs 就是绕
    patterns: [
      /\brequire\s*\(\s*['"`](?:node:)?(fs|child_process|net|dgram|dns|tls|http|https|module|vm|worker_threads|os|process)['"`]\s*\)/g,
      /\bimport\s*\(\s*['"`](?:node:)?(fs|child_process|net|dgram|dns|tls|http|https|module|vm|worker_threads|os|process)['"`]\s*\)/g,
      /\bfrom\s+['"`](?:node:)?(fs|child_process|net|dgram|dns|tls|http|https|module|vm|worker_threads|os|process)['"`]/g,
      /\bprocess\s*\.\s*(?:binding|mainModule|dlopen)\b/g,
    ],
  },
  {
    id: "credential-read",
    level: "high",
    scope: ["main", "renderer"],
    // 单条命中只提示。是否拦见 scan.ts 的「凭据 + 外传」组合判定
    patterns: [/document\s*\.\s*cookie/gi, /\bMUSIC_U\b/g, /\bSESSDATA\b/g, /\bbili_jct\b/g, /\bDedeUserID\b/g],
  },
  {
    id: "password-scrape",
    level: "critical",
    blocking: true,
    scope: ["renderer"],
    patterns: [
      /input\s*\[\s*type\s*=\s*['"`]?password/gi,
      /\btype\s*=\s*['"`]password['"`]/gi,
      /querySelector(?:All)?\s*\(\s*['"`][^'"`]*password[^'"`]*['"`]\s*\)/gi,
    ],
  },
  {
    id: "clipboard-read",
    level: "high",
    scope: ["renderer"],
    patterns: [/navigator\s*\.\s*clipboard\s*\.\s*read/gi, /execCommand\s*\(\s*['"`]paste['"`]/gi],
  },
  {
    id: "dynamic-code",
    level: "medium",
    scope: ["main", "renderer"],
    // eval 在插件里常见于配置解析，不拦，但要让人看见
    patterns: [/\beval\s*\(/g, /new\s+Function\s*\(/g, /\bsetTimeout\s*\(\s*['"`]/g, /\bsetInterval\s*\(\s*['"`]/g],
  },
  {
    id: "obfuscation",
    level: "medium",
    scope: ["main", "renderer"],
    // 大量 \x 转义或超长 base64 块，正常插件不会这么写
    patterns: [/(?:\\x[0-9a-fA-F]{2}){20,}/g, /[A-Za-z0-9+/]{600,}={0,2}/g],
  },
  {
    id: "path-traversal",
    level: "high",
    scope: ["main"],
    patterns: [/\.\.\s*[/\\]\.\./g, /path\s*\.\s*(?:join|resolve)\s*\([^)]*\.\.[/\\]/g],
  },
  {
    id: "remote-code-load",
    level: "critical",
    blocking: true,
    scope: ["main", "renderer"],
    // 运行时从网上拉一段代码执行 —— 装的时候看着干净，跑起来换一身
    patterns: [
      /(?:fetch|invoke|get)\s*\([^)]*\)\s*\.then\s*\([^)]*\)\s*\.then\s*\([^)]*eval/gi,
      /atob\s*\([^)]*\)[^\n]{0,40}eval/gi,
      /eval\s*\(\s*(?:await\s+)?(?:fetch|atob|decodeURIComponent)/gi,
    ],
  },
  {
    id: "auto-start",
    level: "low",
    scope: ["main"],
    // 开机自启/写系统项，属于「用户该知道」而非「一定有问题」
    patterns: [/setLoginItemSettings/g, /LaunchAgents|LaunchDaemons/g],
  },
];

/** 规则 id → 级别/是否拦截，给 scan.ts 汇总用 */
export const RULE_META: Record<string, { level: PluginRiskLevel; blocking: boolean }> = Object.fromEntries(
  SCAN_RULES.map(rule => [rule.id, { level: rule.level, blocking: rule.blocking === true }]),
);

/** 组合判定出来的规则（不在 SCAN_RULES 里，靠「凭据 + 外传」推出） */
export const COMBINED_RULE = {
  id: "credential-exfiltration",
  level: "critical" as PluginRiskLevel,
  blocking: true,
};
