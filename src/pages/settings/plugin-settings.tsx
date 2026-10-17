import React, { useCallback, useEffect, useMemo, useState } from "react";

import { addToast, Button, Chip, Switch } from "@heroui/react";
import { RiAddLine, RiFolderOpenLine, RiRefreshLine } from "@remixicon/react";

import { t } from "@/common/i18n";
import { getRendererCommands, runRendererCommand } from "@/plugin/runtime";

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

const PluginRow = ({
  plugin,
  busy,
  onToggle,
}: {
  plugin: PluginInfo;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
}) => {
  const manifest = plugin.manifest;
  const broken = Boolean(plugin.error);

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
        </div>

        {broken && <p className="text-danger text-xs">{plugin.error}</p>}
        {plugin.runtimeError && (
          <pre className="text-danger max-h-24 overflow-auto text-xs break-all whitespace-pre-wrap">
            {plugin.runtimeError}
          </pre>
        )}
      </div>

      <div className="flex flex-none flex-col items-end gap-2">
        <Switch
          isDisabled={broken || busy}
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
      </div>
    </div>
  );
};

const PluginSettings = () => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [mainCommands, setMainCommands] = useState<PluginCommandInfo[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  /** 界面侧命令要等插件脚本跑完才注册得上来，用一个计数触发重算 */
  const [rendererTick, setRendererTick] = useState(0);

  const refresh = useCallback(async () => {
    if (!window.electron?.plugin) return;
    const [list, commands] = await Promise.all([window.electron.plugin.list(), window.electron.plugin.listCommands()]);
    setPlugins(list);
    setMainCommands(commands);
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
        <div className="flex flex-none gap-2">
          <Button
            size="sm"
            variant="flat"
            startContent={<RiFolderOpenLine size={14} />}
            onPress={() => window.electron.plugin.openDir()}
          >
            {t("打开插件目录")}
          </Button>
          <Button
            size="sm"
            variant="flat"
            isLoading={reloading}
            startContent={!reloading && <RiRefreshLine size={14} />}
            onPress={reloadAll}
          >
            {t("重新加载")}
          </Button>
        </div>
      </div>

      {plugins.length ? (
        <div className="space-y-3">
          {plugins.map(plugin => (
            <PluginRow
              key={plugin.id}
              plugin={plugin}
              busy={busyId === plugin.id}
              onToggle={enabled => void togglePlugin(plugin.id, enabled)}
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
