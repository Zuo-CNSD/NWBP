import log from "electron-log";

/**
 * 插件行为审计。
 *
 * 只存**内存里的最近若干条**，不落盘。理由：
 *  - 落盘就要处理轮转、清理、隐私（审计里会有域名和路径），成本远大于收益；
 *  - 用户真正需要的是「刚才这个插件往哪发了东西」，翻历史记录的需求很弱；
 *  - 不落盘也就不会留下「用户访问过哪些域名」的额外痕迹。
 *
 * 设置页读这里的数据画成列表，重启即清空 —— 界面上会写明这一点。
 */

const PER_PLUGIN_LIMIT = 120;

const buffer = new Map<string, PluginAuditEntry[]>();

export const recordAudit = (entry: PluginAuditEntry) => {
  const list = buffer.get(entry.pluginId) ?? [];
  list.push(entry);
  if (list.length > PER_PLUGIN_LIMIT) list.splice(0, list.length - PER_PLUGIN_LIMIT);
  buffer.set(entry.pluginId, list);

  if (entry.blocked) {
    log.warn(`[plugin:${entry.pluginId}] 已拦截 ${entry.kind} → ${entry.target}（${entry.reason ?? "无原因"}）`);
  }
};

export const getAudit = (pluginId?: string): PluginAuditEntry[] => {
  if (pluginId) return [...(buffer.get(pluginId) ?? [])];
  return [...buffer.values()].flat().sort((a, b) => b.at - a.at);
};

export const clearAudit = (pluginId?: string) => {
  if (pluginId) buffer.delete(pluginId);
  else buffer.clear();
};
