/**
 * 插件卡片的展示文案表。
 *
 * 单独一个文件而不是塞在 `plugin-settings.tsx` 里，有两个原因：
 *   1. 这几张表的值是**中文原文**，渲染时才有 `t(表[x])` 包一层 —— 静态扫描
 *      抓不到它们，所以 `tests/i18n.test.ts` 要逐个查一遍，而测试不该为了拿四张表
 *      去 import 一整个 700 行的页面组件（会把 HeroUI 和 window.electron 都拽进来）；
 *   2. 页面组件只导出组件，React Fast Refresh 才不会退化。
 */

/** 权限 → 中文标签。清单里没声明的一律不给对应能力，所以这里要显示清楚。 */
export const PERMISSION_LABELS: Record<PluginPermission, string> = {
  ui: "界面",
  music: "播放器",
  fs: "文件",
  net: "网络",
  shell: "系统",
  store: "存储",
  notification: "通知",
};

/**
 * 风险级别的展示方式。
 *
 * `safe` 不显示 —— 界面上到处挂个「安全」标签会让人误以为那是一次审计结论，
 * 而它其实只表示「没命中已知特征」。没有标签，才不夸大。
 */
export const RISK_META: Record<Exclude<PluginRiskLevel, "safe">, { label: string; color: "warning" | "danger" }> = {
  low: { label: "低风险", color: "warning" },
  medium: { label: "需留意", color: "warning" },
  high: { label: "高风险", color: "danger" },
  critical: { label: "严重风险", color: "danger" },
};

/**
 * 插件来源的展示文案。
 *
 * 开放发布之后，「这东西哪来的」和「它能碰什么」一样重要 ——
 * 从链接装的和自己拷进来的，用户该能分清。
 */
export const SOURCE_LABELS: Record<PluginSourceInfo["kind"], string> = {
  local: "本地放入",
  zip: "压缩包安装",
  url: "链接安装",
};

/** 规则 id → 一句话说明。用户看的是「它干了什么」，不是规则代号。 */
export const RULE_LABELS: Record<string, string> = {
  "node-escape": "试图直接调用系统文件 / 进程能力",
  "credential-read": "读取账号凭据",
  "credential-exfiltration": "同时读取凭据并向外发送",
  "password-scrape": "读取密码输入框",
  "clipboard-read": "读取剪贴板内容",
  "dynamic-code": "动态执行代码",
  obfuscation: "代码经过混淆",
  "path-traversal": "试图访问自身目录之外的文件",
  "remote-code-load": "从网络拉取代码并执行",
  "auto-start": "注册开机自启动项",
};
