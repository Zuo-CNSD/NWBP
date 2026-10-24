/**
 * 插件安全相关的类型（主进程 / 渲染进程共用）。
 *
 * 立场先说清楚，免得后面被误读：
 * **静态扫描不是沙箱。** 它挡得住「随手写的坏插件」和「从别处抄来的带毒片段」，
 * 挡不住铁了心要绕的人（混淆、反射、延迟加载都能过）。
 * 所以这里的定位是「提高作恶门槛 + 让用户看得见」，而不是「保证安全」。
 *
 * 真正兜底的是另外两件事：
 *   1. 凭据本身不交给插件（渲染端受限 window 代理、主进程能力收窄）；
 *   2. 出问题时能一键进安全模式把插件全停掉。
 */

/** 风险级别。`safe` 只表示「没扫出已知特征」，不表示审计过 */
type PluginRiskLevel = "safe" | "low" | "medium" | "high" | "critical";

/** 扫描命中的一条问题 */
interface PluginFinding {
  /** 规则 id，稳定不变；界面按它查 i18n 文案 */
  rule: string;
  level: PluginRiskLevel;
  /** 命中在哪个文件（manifest.json / main.js / index.js / xxx.css） */
  file: string;
  /** 1 起的行号；整文件级问题（如体积异常）为 0 */
  line: number;
  /** 命中的原始片段，已截断，给用户看证据用 */
  evidence: string;
  /** 这条是否会导致插件被拒绝加载 */
  blocking: boolean;
}

/** 一个插件的扫描结论 */
interface PluginScanResult {
  level: PluginRiskLevel;
  /** 是否拒绝加载。true 时插件不会运行，除非用户显式放行 */
  blocked: boolean;
  findings: PluginFinding[];
  /** 参与扫描的文件名 */
  scannedFiles: string[];
  /** 扫描时间戳（ms） */
  scannedAt: number;
  /** 源码指纹，用于「改过代码要重新扫」以及 AI 检测的缓存键 */
  digest: string;
}

/** 插件来源。开放生态下用户要能判断「这东西哪来的」 */
interface PluginSourceInfo {
  /** local = 用户自己放进目录的；zip = 压缩包安装；url = 从链接下载 */
  kind: "local" | "zip" | "url";
  /** 来源链接或原始文件路径 */
  from?: string;
  /** 安装时间戳 */
  installedAt?: number;
}

/** 审计条目：插件碰了网络或敏感能力，留一条记录 */
interface PluginAuditEntry {
  at: number;
  pluginId: string;
  kind: "net" | "credential" | "fs" | "shell";
  /** 目标（URL / 路径 / 能力名） */
  target: string;
  /** 是否被拦截 */
  blocked: boolean;
  /** 拦截或放行的原因 */
  reason?: string;
  /** 请求体/响应体大小（net 才有） */
  size?: number;
}

/** 安装一个插件的结果。装完直接把风险摆给用户，不留到下次启动 */
interface PluginInstallResult {
  id: string;
  name: string;
  /** 扫描结论 */
  level: PluginRiskLevel;
  blocked: boolean;
  findings: number;
  /** 被拦截 → 默认停用（留在列表里可见可删） */
  disabled: boolean;
}

/** AI 检测的落盘配置（含 apiKey，只存在于主进程） */
interface PluginAiState {
  enabled: boolean;
  /** OpenAI 兼容端点，例如 https://api.deepseek.com/v1 */
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** 给渲染端看的配置：**不含 apiKey**，只说明填没填 */
interface PluginAiConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  hasKey: boolean;
}

/** AI 给出的一条风险说明 */
interface PluginAiFinding {
  /** 一句话说清问题 */
  title: string;
  /** 为什么危险、可能造成什么后果 */
  detail: string;
  level: PluginRiskLevel;
  /** 涉及的代码位置，例如 index.js:12 */
  location?: string;
}

/**
 * AI 检测结论。
 *
 * 刻意**不提供单一分数** —— 一个 7/100 的数字既不能指导决定，
 * 又会让人以为「系统已经判过了」。要说的是它到底会动什么。
 */
interface PluginAiScanResult {
  level: PluginRiskLevel;
  /** 整体判断，两三句话 */
  summary: string;
  findings: PluginAiFinding[];
  model: string;
  scannedAt: number;
  /** 命中缓存（代码没改过，没有重复计费） */
  cached: boolean;
}
