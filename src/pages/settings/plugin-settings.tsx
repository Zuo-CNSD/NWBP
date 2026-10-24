import React, { useCallback, useEffect, useMemo, useState } from "react";

import { addToast, Button, Chip, Input, Switch } from "@heroui/react";
import {
  RiAddLine,
  RiBookOpenLine,
  RiFileZipLine,
  RiFolderOpenLine,
  RiLinkM,
  RiRefreshLine,
  RiShieldCheckLine,
} from "@remixicon/react";

import { t } from "@/common/i18n";
import { getRendererCommands, runRendererCommand } from "@/plugin/runtime";

/** 插件开发文档（跟着仓库走，官网也指向这里，别在两处写不同的地址） */
const PLUGIN_DOC_URL = "https://github.com/Zuo-CNSD/NWBP/blob/main/docs/plugin-development.md";

/** 权限 → 中文标签。清单里没声明的一律不给对应能力，所以这里要显示清楚。 */
const PERMISSION_LABELS: Record<PluginPermission, string> = {
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
const RISK_META: Record<Exclude<PluginRiskLevel, "safe">, { label: string; color: "warning" | "danger" }> = {
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
const SOURCE_LABELS: Record<PluginSourceInfo["kind"], string> = {
  local: "本地放入",
  zip: "压缩包安装",
  url: "链接安装",
};

/** 规则 id → 一句话说明。用户看的是「它干了什么」，不是规则代号。 */
const RULE_LABELS: Record<string, string> = {
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

/**
 * AI 检测的端点配置。
 *
 * 刻意不内置任何一家厂商的 key：
 *  - 检测要花钱，费用必须由用户自己决定要不要承担；
 *  - 把插件源码发给第三方，是用户自己的选择，不该默认发生。
 * 只要端点兼容 OpenAI 的 `/chat/completions`，DeepSeek / 智谱 / Moonshot / 本地 Ollama 都能填。
 */
const AiConfigPanel = () => {
  const [config, setConfig] = useState<PluginAiConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void window.electron.plugin.aiConfig().then(next => {
      setConfig(next);
      setBaseUrl(next.baseUrl);
      setModel(next.model);
    });
  }, []);

  const save = async (patch: Partial<PluginAiState>) => {
    setSaving(true);
    try {
      const next = await window.electron.plugin.aiConfig(patch);
      setConfig(next);
      setKey("");
      addToast({ title: t("已保存") });
    } finally {
      setSaving(false);
    }
  };

  if (!config) return null;

  return (
    <details className="bg-default-50 rounded-medium p-3">
      <summary className="text-default-500 cursor-pointer text-sm">
        {t("AI 插件安全检测（可选，需要自己填 API）")}
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-default-400 text-xs leading-relaxed">
          {t(
            "静态规则查的是确定的行为特征；AI 能看懂「这段代码到底想干什么」。两者互补，但 AI 也可能漏判——它的结论仅供参考，不能当成安全保证。",
          )}
        </p>
        <p className="text-default-400 text-xs leading-relaxed">
          {t("开启后会把插件的源码发给下面这个端点。不填就完全不联网。")}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Switch
            size="sm"
            isSelected={config.enabled}
            disableAnimation
            onValueChange={enabled => void save({ enabled })}
          >
            {t("启用 AI 检测")}
          </Switch>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            size="sm"
            label={t("API 端点")}
            placeholder="https://api.deepseek.com/v1"
            value={baseUrl}
            onValueChange={setBaseUrl}
            onBlur={() => baseUrl !== config.baseUrl && void save({ baseUrl })}
          />
          <Input
            size="sm"
            label={t("模型名")}
            placeholder="deepseek-chat"
            value={model}
            onValueChange={setModel}
            onBlur={() => model !== config.model && void save({ model })}
          />
        </div>

        <div className="flex items-end gap-2">
          <Input
            size="sm"
            type="password"
            label={t("API Key")}
            placeholder={config.hasKey ? t("已保存，留空表示不修改") : t("未填写")}
            value={key}
            onValueChange={setKey}
          />
          <Button
            size="sm"
            variant="flat"
            isLoading={saving}
            isDisabled={!key.trim()}
            onPress={() => void save({ apiKey: key })}
          >
            {t("保存 Key")}
          </Button>
          {config.hasKey && (
            <Button
              size="sm"
              variant="light"
              color="danger"
              onPress={() =>
                void window.electron.plugin.aiClearKey().then(next => {
                  setConfig(next);
                  addToast({ title: t("已清除 API Key") });
                })
              }
            >
              {t("清除")}
            </Button>
          )}
        </div>
      </div>
    </details>
  );
};

const PluginRow = ({
  plugin,
  busy,
  onToggle,
  onOverride,
}: {
  plugin: PluginInfo;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onOverride: (id: string, overridden: boolean) => void;
}) => {
  const manifest = plugin.manifest;
  const broken = Boolean(plugin.error);
  const security = plugin.security;
  const blocked = Boolean(security?.blocked) && !plugin.overridden;
  const risk = security && security.level !== "safe" ? RISK_META[security.level] : null;

  const [ai, setAi] = useState<PluginAiScanResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const runAi = async () => {
    setAiBusy(true);
    try {
      setAi(await window.electron.plugin.aiScan(plugin.id));
    } catch (error) {
      addToast({
        title: t("AI 检测失败：{0}", error instanceof Error ? error.message : String(error)),
        color: "danger",
      });
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="border-default-200 rounded-medium flex items-start justify-between gap-4 border p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base leading-none">{manifest?.icon || "🧩"}</span>
          <span className="font-medium">{manifest?.name ?? plugin.id}</span>
          {manifest?.version && (
            <Chip size="sm" variant="flat">
              v{manifest.version}
            </Chip>
          )}
          {risk && (
            <Chip size="sm" variant="flat" color={risk.color}>
              {t(risk.label)}
            </Chip>
          )}
          {blocked && (
            <Chip size="sm" variant="flat" color="danger">
              {t("已拦截")}
            </Chip>
          )}
          {plugin.running && (
            <Chip size="sm" variant="flat" color="success">
              {t("运行中")}
            </Chip>
          )}
          {!plugin.enabled && !broken && (
            <Chip size="sm" variant="flat" color="default">
              {t("已停用")}
            </Chip>
          )}
        </div>

        <div className="text-default-400 truncate font-mono text-xs" title={plugin.folder}>
          {plugin.id}
        </div>

        {manifest?.description && <p className="text-default-500 text-sm">{manifest.description}</p>}

        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {/* 注入样式 / 脚本不要求 ui 权限，所以单独标一项，别让人以为「没权限就什么都没动」 */}
          {(plugin.hasRenderer || plugin.styles.length > 0) && (
            <Chip size="sm" variant="dot" className="text-default-500">
              {t("注入界面")}
            </Chip>
          )}
          {plugin.permissions.length ? (
            plugin.permissions.map(permission => (
              <Chip key={permission} size="sm" variant="dot" className="text-default-500">
                {t(PERMISSION_LABELS[permission] ?? permission)}
              </Chip>
            ))
          ) : (
            <span className="text-default-400 text-xs">{t("不调用系统能力")}</span>
          )}
          {manifest?.author && <span className="text-default-400 ml-1 text-xs">· {manifest.author}</span>}
          {plugin.source && (
            <span
              className="text-default-400 ml-1 text-xs"
              title={plugin.source.from ? String(plugin.source.from) : undefined}
            >
              · {t(SOURCE_LABELS[plugin.source.kind])}
              {plugin.source.installedAt ? ` ${new Date(plugin.source.installedAt).toLocaleDateString()}` : ""}
            </span>
          )}
        </div>

        {blocked && (
          <div className="rounded-medium border-danger/30 bg-danger/5 space-y-1.5 border p-2.5">
            <p className="text-danger text-xs font-medium">{t("这个插件被安全扫描拦下了，没有运行")}</p>
            <p className="text-default-500 text-xs">{t("它触发了下列规则。确认来源可信再放行，风险由你自己承担。")}</p>
            <Button size="sm" color="danger" variant="flat" onPress={() => onOverride(plugin.id, true)}>
              {t("我知道风险，仍然启用")}
            </Button>
          </div>
        )}

        {plugin.overridden && security?.blocked && (
          <div className="rounded-medium border-warning/40 bg-warning/5 flex flex-wrap items-center gap-2 border p-2.5">
            <p className="text-warning-600 text-xs">{t("已放行：这个插件原本被扫描拦截")}</p>
            <Button size="sm" variant="light" onPress={() => onOverride(plugin.id, false)}>
              {t("撤销放行")}
            </Button>
          </div>
        )}

        {security && security.findings.length > 0 && (
          <details className="bg-default-50 rounded-medium p-2">
            <summary className="text-default-500 cursor-pointer text-xs">
              {t("安全扫描：{0} 项提示", security.findings.length)}
            </summary>
            <ul className="mt-1.5 space-y-1.5">
              {security.findings.slice(0, 8).map((finding, index) => (
                <li key={`${finding.rule}-${finding.file}-${finding.line}-${index}`} className="text-xs">
                  <span className={finding.level === "critical" ? "text-danger" : "text-default-600"}>
                    {t(RULE_LABELS[finding.rule] ?? finding.rule)}
                  </span>
                  <span className="text-default-400">
                    {" · "}
                    {finding.file}
                    {finding.line ? `:${finding.line}` : ""}
                  </span>
                  <code className="text-default-400 mt-0.5 block truncate font-mono">{finding.evidence}</code>
                </li>
              ))}
            </ul>
          </details>
        )}

        {ai && (
          <div className="border-default-200 rounded-medium space-y-1.5 border p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="sm" variant="flat" color={ai.level === "safe" ? "success" : RISK_META[ai.level].color}>
                {ai.level === "safe" ? t("未发现明显问题") : t(RISK_META[ai.level].label)}
              </Chip>
              <span className="text-default-400 text-xs">
                {t("AI 判读 · {0}", ai.model)}
                {ai.cached ? ` · ${t("命中缓存")}` : ""}
              </span>
            </div>
            <p className="text-default-600 text-xs leading-relaxed">{ai.summary}</p>
            {ai.findings.length > 0 && (
              <ul className="space-y-1.5">
                {ai.findings.map((finding, index) => (
                  <li key={`${finding.title}-${index}`} className="text-xs">
                    <span
                      className={
                        finding.level === "critical" || finding.level === "high" ? "text-danger" : "text-default-600"
                      }
                    >
                      {finding.title}
                    </span>
                    {finding.location && <span className="text-default-400"> · {finding.location}</span>}
                    <p className="text-default-400 mt-0.5 leading-relaxed">{finding.detail}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-default-400 text-[11px]">{t("AI 判断可能出错，不能替代你自己的判断。")}</p>
          </div>
        )}

        {broken && <p className="text-danger text-xs">{plugin.error}</p>}
        {plugin.runtimeError && (
          <pre className="text-danger max-h-24 overflow-auto text-xs break-all whitespace-pre-wrap">
            {plugin.runtimeError}
          </pre>
        )}
      </div>

      <div className="flex flex-none flex-col items-end gap-2">
        <Switch
          isDisabled={broken || busy || blocked}
          isSelected={plugin.enabled && !broken}
          disableAnimation
          onValueChange={onToggle}
        />
        <Button
          size="sm"
          variant="flat"
          startContent={<RiFolderOpenLine size={14} />}
          onPress={() => window.electron.plugin.reveal(plugin.id)}
        >
          {t("定位")}
        </Button>
        <Button
          size="sm"
          variant="light"
          isLoading={aiBusy}
          startContent={!aiBusy && <RiShieldCheckLine size={14} />}
          onPress={() => void runAi()}
        >
          {t("AI 检测")}
        </Button>
      </div>
    </div>
  );
};

const PluginSettings = () => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [mainCommands, setMainCommands] = useState<PluginCommandInfo[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [safeMode, setSafeMode] = useState<{ active: boolean; reason: string | null } | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  /** 界面侧命令要等插件脚本跑完才注册得上来，用一个计数触发重算 */
  const [rendererTick, setRendererTick] = useState(0);

  const refresh = useCallback(async () => {
    if (!window.electron?.plugin) return;
    const [list, commands, mode] = await Promise.all([
      window.electron.plugin.list(),
      window.electron.plugin.listCommands(),
      window.electron.plugin.safeMode(),
    ]);
    setPlugins(list);
    setMainCommands(commands);
    setSafeMode(mode);
    setRendererTick(tick => tick + 1);
  }, []);

  useEffect(() => {
    if (!window.electron?.plugin) return;

    void refresh();
    // 插件脚本是 App 挂载时异步注入的，晚一拍再拉一次界面侧注册的命令
    const timer = setTimeout(() => setRendererTick(tick => tick + 1), 600);

    // 开关插件 / 重新加载后主进程会广播，列表跟着刷
    const off = window.electron.plugin.onEvent(payload => {
      if (payload.event === "plugins-changed") void refresh();
    });

    return () => {
      clearTimeout(timer);
      off();
    };
  }, [refresh]);

  const commands = useMemo<PluginCommandInfo[]>(
    () => [
      ...mainCommands,
      ...getRendererCommands().map(command => ({
        pluginId: command.pluginId,
        pluginName: command.pluginName,
        id: command.id,
        title: command.title,
        from: "renderer" as const,
      })),
    ],
    // rendererTick 只用来表示「该重新读一遍注册表了」
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mainCommands, rendererTick],
  );

  const togglePlugin = async (id: string, enabled: boolean) => {
    setBusyId(id);
    try {
      const list = await window.electron.plugin.setEnabled(id, enabled);
      setPlugins(list);
    } finally {
      setBusyId(null);
    }
  };

  const overridePlugin = async (id: string, overridden: boolean) => {
    setBusyId(id);
    try {
      const list = await window.electron.plugin.setOverride(id, overridden);
      setPlugins(list);
      addToast({
        title: overridden ? t("已放行，这个插件的风险由你承担") : t("已撤销放行"),
      });
    } finally {
      setBusyId(null);
    }
  };

  const installOne = async (run: () => Promise<PluginInstallResult | null>) => {
    setInstalling(true);
    try {
      const result = await run();
      if (!result) return;
      await refresh();
      addToast({
        title: result.blocked
          ? t("已安装 {0}，但被安全扫描拦下，已默认停用", result.name)
          : t("已安装 {0}", result.name),
        color: result.blocked ? "danger" : "success",
      });
    } catch (error) {
      addToast({
        title: t("安装失败：{0}", error instanceof Error ? error.message : String(error)),
        color: "danger",
      });
    } finally {
      setInstalling(false);
    }
  };

  const leaveSafeMode = async () => {
    const mode = await window.electron.plugin.setSafeMode(false);
    setSafeMode(mode);
    addToast({ title: t("已解除安全模式，重新加载后插件才会跑") });
  };

  /** 「装了个插件后打不开了」的最后一道门：下次启动一个都不加载 */
  const disableAllNextBoot = async () => {
    const mode = await window.electron.plugin.setSafeMode(true);
    setSafeMode(mode);
    addToast({ title: t("下次启动将不加载任何插件，重启后生效") });
  };

  const reloadAll = async () => {
    setReloading(true);
    try {
      const list = await window.electron.plugin.reload();
      setPlugins(list);
      addToast({ title: t("插件已重新加载") });
    } finally {
      setReloading(false);
    }
  };

  const installSample = async () => {
    const result = await window.electron.plugin.installSample();
    await refresh();
    addToast({
      title: result.created ? t("示例插件已写入，可以直接改了") : t("示例插件已经在插件目录里了"),
    });
  };

  const runCommand = async (command: PluginCommandInfo) => {
    try {
      if (command.from === "renderer") await runRendererCommand(command.pluginId, command.id);
      else await window.electron.plugin.runCommand(command.pluginId, command.id);
      addToast({ title: t("已运行：{0}", command.title) });
    } catch (error) {
      addToast({
        title: t("运行失败：{0}", error instanceof Error ? error.message : String(error)),
        color: "danger",
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-1">
          <div className="text-medium font-medium">{t("插件")}</div>
          <div className="text-default-500 text-sm">
            {t("插件可以改界面样式、加新功能。放进插件目录即生效，不需要重启应用。")}
          </div>
        </div>
        <div className="flex flex-none flex-wrap justify-end gap-2">
          <Button
            size="sm"
            color="primary"
            variant="flat"
            isLoading={installing}
            startContent={!installing && <RiFileZipLine size={14} />}
            onPress={() => void installOne(() => window.electron.plugin.installFromFile())}
          >
            {t("从文件安装")}
          </Button>
          <Button
            size="sm"
            variant="flat"
            startContent={<RiLinkM size={14} />}
            onPress={() => setUrlOpen(open => !open)}
          >
            {t("从链接安装")}
          </Button>
          <Button
            size="sm"
            variant="light"
            startContent={<RiFolderOpenLine size={14} />}
            onPress={() => window.electron.plugin.openDir()}
          >
            {t("打开插件目录")}
          </Button>
          <Button
            size="sm"
            variant="light"
            isLoading={reloading}
            startContent={!reloading && <RiRefreshLine size={14} />}
            onPress={reloadAll}
          >
            {t("重新加载")}
          </Button>
          {/* 文档在仓库里，界面里至少给一个能点到的地方 —— 否则只有看过 README 的人才知道有它 */}
          <Button
            size="sm"
            variant="light"
            startContent={<RiBookOpenLine size={14} />}
            onPress={() => window.electron.openExternal(PLUGIN_DOC_URL)}
          >
            {t("开发文档")}
          </Button>
        </div>
      </div>

      {urlOpen && (
        <div className="flex items-end gap-2">
          <Input
            size="sm"
            label={t("插件包链接")}
            placeholder="https://example.com/my-plugin.zip"
            value={url}
            onValueChange={setUrl}
            description={t("下载后走和本地安装完全相同的检查流程；文件上限 60MB。")}
          />
          <Button
            size="sm"
            color="primary"
            isLoading={installing}
            isDisabled={!url.trim()}
            onPress={() => void installOne(() => window.electron.plugin.installFromUrl(url.trim()))}
          >
            {t("下载并安装")}
          </Button>
        </div>
      )}

      <AiConfigPanel />

      {safeMode?.active && (
        <div className="rounded-medium border-warning/40 bg-warning/5 flex flex-wrap items-center justify-between gap-3 border p-3">
          <div className="space-y-0.5">
            <p className="text-warning-600 text-sm font-medium">{t("安全模式生效中")}</p>
            <p className="text-default-500 text-xs">
              {safeMode.reason === "crash-loop"
                ? t("检测到连续启动失败，这次没有加载任何插件。")
                : t("按你的设置，这次没有加载任何插件。")}
            </p>
          </div>
          <Button size="sm" variant="flat" onPress={leaveSafeMode}>
            {t("恢复正常加载")}
          </Button>
        </div>
      )}

      {plugins.length ? (
        <div className="space-y-3">
          {plugins.map(plugin => (
            <PluginRow
              key={plugin.id}
              plugin={plugin}
              busy={busyId === plugin.id}
              onToggle={enabled => void togglePlugin(plugin.id, enabled)}
              onOverride={(id, overridden) => void overridePlugin(id, overridden)}
            />
          ))}
        </div>
      ) : (
        <div className="border-default-200 rounded-medium flex flex-col items-center gap-3 border border-dashed px-6 py-10 text-center">
          <p className="text-default-500 text-sm">{t("还没有装任何插件")}</p>
          <Button size="sm" variant="flat" startContent={<RiAddLine size={14} />} onPress={installSample}>
            {t("创建示例插件")}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-default-400 text-xs">
          {t("装了插件后应用打不开？连续两次起不来会自动进安全模式，也可以现在就把下次启动设成不加载插件。")}
        </p>
        <Button size="sm" variant="light" onPress={disableAllNextBoot}>
          {t("下次启动禁用全部插件")}
        </Button>
      </div>

      {commands.length > 0 && (
        <div className="space-y-2">
          <div className="text-default-500 text-sm">{t("插件命令")}</div>
          <div className="space-y-1.5">
            {commands.map(command => (
              <div
                key={`${command.pluginId}:${command.id}`}
                className="bg-content2 rounded-medium flex items-center justify-between gap-4 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm">{command.title}</div>
                  <div className="text-default-400 truncate font-mono text-xs">
                    {command.pluginName} · {command.id}
                  </div>
                </div>
                <Button size="sm" variant="light" onPress={() => void runCommand(command)}>
                  {t("运行")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PluginSettings;
