import log from "electron-log";
import fs from "node:fs";
import path from "node:path";

import { pluginAiStore } from "../../store";
import { getUserDataPath } from "../../utils";

/**
 * AI 插件安全检测。
 *
 * 定位：**静态规则的补充，不是替代**。
 * 规则表能确定地抓住「读 cookie 又往外发」这种硬特征；AI 擅长的是看懂
 * 「它到底在干什么」——比如把凭据拆成几段拼接、用自建域名做中转、
 * 或者把读取和发送放在两个文件里。两者是互补关系。
 *
 * 三条成本与安全的控制：
 *  1. **默认关闭**，只有用户在设置页填了端点并点「检测」才会调用；
 *  2. 结果按源码指纹缓存，代码没改过就复用，不重复计费；
 *  3. 源码截断后发送，且只发插件自己的文件 —— 不发用户数据、不发播放记录。
 *
 * 还有一条底线：**AI 说不清楚就不算合格**。返回里必须有人能读懂的风险说明，
 * 解析不出结构化结果时按「未完成」处理，而不是当作「安全」。
 */

const MAX_CHARS_PER_FILE = 6000;
const MAX_TOTAL_CHARS = 18000;
const REQUEST_TIMEOUT_MS = 45_000;
const CACHE_FILE = "plugin-ai-cache.json";

const SYSTEM_PROMPT = [
  "你是音乐播放器 NWBP 的插件安全审查员。",
  "插件运行在用户本机，能改界面、能联网，主进程入口还能拿 Node 能力。",
  "你要判断它是否会：读取或外传账号凭据（网易云 MUSIC_U、B 站 SESSDATA/bili_jct 等）、",
  "读取密码框或剪贴板、把用户数据发到第三方、执行远程下发代码、绕过文件访问限制、",
  "注册开机自启或驻留。",
  "只输出 JSON，不要 markdown 代码块，不要额外解释。",
].join("");

const userPrompt = (manifest: string, sources: { name: string; text: string }[]) => {
  const blocks = sources.map(file => `--- ${file.name} ---\n${file.text}`).join("\n\n");
  return [
    "请审查下面这个插件，输出 JSON：",
    '{"level":"safe|low|medium|high|critical","summary":"两三句话概括它实际会做什么","findings":[{"title":"一句话问题","detail":"为什么危险、后果是什么","level":"low|medium|high|critical","location":"文件:行号或空"}]}',
    "要求：",
    "1. summary 用中文，讲清它有什么功能、要什么权限、可能碰到什么数据；",
    "2. 没有问题就给空 findings 数组，level 用 safe；不要为了凑数编问题；",
    "3. findings 要具体到行为，别写「可能存在安全风险」这种空话。",
    "",
    "manifest.json:",
    manifest,
    "",
    "源码：",
    blocks,
  ].join("\n");
};

const cacheFile = () => path.join(getUserDataPath(), CACHE_FILE);

type AiCache = Record<string, PluginAiScanResult>;

const readCache = (): AiCache => {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(), "utf-8")) as AiCache;
  } catch {
    return {};
  }
};

const writeCache = (cache: AiCache) => {
  try {
    fs.writeFileSync(cacheFile(), JSON.stringify(cache, null, 2), "utf-8");
  } catch (error) {
    log.error("[plugin] 写 AI 检测缓存失败:", error);
  }
};

export const readAiConfig = (): PluginAiConfig => {
  const baseUrl = pluginAiStore.get("baseUrl", "");
  const model = pluginAiStore.get("model", "");
  return {
    enabled: pluginAiStore.get("enabled", false),
    baseUrl,
    model,
    hasKey: Boolean(pluginAiStore.get("apiKey", "")),
  };
};

export const writeAiConfig = (patch: Partial<PluginAiState>): PluginAiConfig => {
  if (patch.enabled !== undefined) pluginAiStore.set("enabled", patch.enabled);
  if (patch.baseUrl !== undefined) pluginAiStore.set("baseUrl", patch.baseUrl.trim());
  if (patch.model !== undefined) pluginAiStore.set("model", patch.model.trim());
  // 空字符串表示「不改」——界面只显示 hasKey，不会回填真 key，避免每次保存都清空
  if (patch.apiKey) pluginAiStore.set("apiKey", patch.apiKey.trim());
  return readAiConfig();
};

export const clearAiKey = (): PluginAiConfig => {
  pluginAiStore.set("apiKey", "");
  return readAiConfig();
};

/** 从模型回复里抠出 JSON —— 有些端点会套一层 markdown 代码块 */
const extractJson = (raw: string): unknown => {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回 JSON");
  return JSON.parse(trimmed.slice(start, end + 1));
};

const normalizeLevel = (value: unknown): PluginRiskLevel => {
  const allowed: PluginRiskLevel[] = ["safe", "low", "medium", "high", "critical"];
  const level = String(value ?? "").toLowerCase() as PluginRiskLevel;
  return allowed.includes(level) ? level : "medium";
};

interface AiScanInput {
  pluginId: string;
  /** 源码指纹：用来做缓存键，代码没改就不重复花钱 */
  digest: string;
  manifest: string;
  sources: { name: string; text: string }[];
  /** 跳过缓存，强制重扫（用户手动点「重新检测」时用） */
  force?: boolean;
}

export async function runAiScan(input: AiScanInput): Promise<PluginAiScanResult> {
  const config = readAiConfig();
  if (!config.enabled) throw new Error("AI 检测没有启用");
  if (!config.baseUrl) throw new Error("还没填 API 端点");
  if (!config.model) throw new Error("还没填模型名");
  const apiKey = pluginAiStore.get("apiKey", "");
  if (!apiKey) throw new Error("还没填 API Key");

  const cacheKey = `${input.pluginId}:${input.digest}:${config.model}`;
  if (!input.force) {
    const cached = readCache()[cacheKey];
    if (cached) return { ...cached, cached: true };
  }

  let total = 0;
  const sources = input.sources.map(file => {
    const room = Math.max(0, Math.min(MAX_CHARS_PER_FILE, MAX_TOTAL_CHARS - total));
    const text = file.text.slice(0, room);
    total += text.length;
    return { name: file.name, text };
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 900,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(input.manifest, sources) },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`接口返回 ${response.status}：${body.slice(0, 160)}`);
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("模型没有返回内容");

    const parsed = extractJson(content) as {
      level?: unknown;
      summary?: unknown;
      findings?: { title?: unknown; detail?: unknown; level?: unknown; location?: unknown }[];
    };

    const result: PluginAiScanResult = {
      level: normalizeLevel(parsed.level),
      summary: String(parsed.summary ?? "").trim() || "模型没有给出概括",
      findings: (parsed.findings ?? [])
        .map(finding => ({
          title: String(finding.title ?? "").trim(),
          detail: String(finding.detail ?? "").trim(),
          level: normalizeLevel(finding.level),
          location: finding.location ? String(finding.location).slice(0, 80) : undefined,
        }))
        .filter(finding => finding.title),
      model: config.model,
      scannedAt: Date.now(),
      cached: false,
    };

    const cache = readCache();
    cache[cacheKey] = result;
    writeCache(cache);
    return result;
  } finally {
    clearTimeout(timer);
  }
}
