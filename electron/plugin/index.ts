import { app, BrowserWindow, ipcMain, Notification, shell } from "electron";
import log from "electron-log";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { channel } from "../ipc/channel";
import { getUserDataPath } from "../utils";
import { SAMPLE_PLUGIN_FILES } from "./sample";

/** 当前应用支持的插件 API 版本。manifest 里写了更高版本就只提示、不加载。 */
export const PLUGIN_API_VERSION = 1;

const MANIFEST_FILE = "manifest.json";
const STATE_FILE = ".state.json";
const DATA_DIR = "plugin-data";
/** 单个文本文件（CSS / 脚本 / 清单）的读取上限，防止误把大文件塞进内存 */
const MAX_TEXT_BYTES = 4 * 1024 * 1024;

const VALID_PERMISSIONS: PluginPermission[] = ["ui", "music", "fs", "net", "shell", "store", "notification"];

interface LoadedPlugin {
  info: PluginInfo;
  /** 已读成文本的注入样式，和 info.styles 一一对应 */
  css: string[];
  /** 渲染端入口源码 */
  code: string;
  dispose?: () => void;
  /** 渲染端可以 invoke 的自定义子通道 */
  handlers: Map<string, (payload: unknown) => unknown>;
  /** 插件注册的命令 */
  commands: { id: string; title: string; run: () => unknown }[];
}

type PluginState = { enabled: Record<string, boolean> };

const isFile = (p: string) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

const isDir = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const readText = (p: string): string | null => {
  try {
    if (!isFile(p) || fs.statSync(p).size > MAX_TEXT_BYTES) return null;
    return fs.readFileSync(p, "utf-8");
  } catch {
    return null;
  }
};

/**
 * 插件的 id 直接来自目录名 / manifest，会拼进文件路径，所以只留安全字符。
 */
const normalizeId = (raw: string, fallback: string) => {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
};

/**
 * 插件管理器。
 *
 * 一个插件 = `plugins/<目录>/` 一个文件夹，三样东西可选：
 *   `manifest.json` 必须，其余都是按 manifest 指过去的文件：
 *   `main.js`     主进程入口（ESM，能拿 Node 能力）
 *   `index.js`    渲染进程入口（注入界面执行，能改 DOM）
 *   若干 `.css`    直接注入界面
 *
 * 放进目录即启用（和 Minecraft 的 mods/ 一样），要关掉在设置页里关。
 */
export class PluginManager {
  readonly dir = path.join(getUserDataPath(), "plugins");
  private readonly dataRoot = path.join(getUserDataPath(), DATA_DIR);
  private readonly plugins = new Map<string, LoadedPlugin>();

  constructor(private readonly getMainWindow: () => BrowserWindow | null) {}

  /* ------------------------------------------------------------------ 目录 */

  ensureDir() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.mkdirSync(this.dataRoot, { recursive: true });
    } catch (error) {
      log.error("[plugin] 创建插件目录失败:", error);
    }
  }

  private stateFile() {
    return path.join(this.dir, STATE_FILE);
  }

  private readState(): PluginState {
    const raw = readText(this.stateFile());
    if (!raw) return { enabled: {} };
    try {
      const parsed = JSON.parse(raw) as PluginState;
      return { enabled: parsed?.enabled && typeof parsed.enabled === "object" ? parsed.enabled : {} };
    } catch {
      return { enabled: {} };
    }
  }

  private writeState(state: PluginState) {
    try {
      fs.writeFileSync(this.stateFile(), JSON.stringify(state, null, 2), "utf-8");
    } catch (error) {
      log.error("[plugin] 写入插件状态失败:", error);
    }
  }

  /* ------------------------------------------------------------ 扫描与读取 */

  /** 重新读一遍插件目录，建出「没加载任何代码」的清单 */
  scan(): void {
    this.ensureDir();
    const state = this.readState();
    const folders = fs
      .readdirSync(this.dir, { withFileTypes: true })
      .filter(item => item.isDirectory() && !item.name.startsWith("."))
      .map(item => item.name);

    const next = new Map<string, LoadedPlugin>();

    for (const folderName of folders) {
      const folder = path.join(this.dir, folderName);
      const fallbackId = normalizeId(folderName, `plugin-${folderName}`);
      const rawManifest = readText(path.join(folder, MANIFEST_FILE));

      if (!rawManifest) {
        next.set(fallbackId, this.brokenPlugin(fallbackId, folder, `缺少 ${MANIFEST_FILE}`));
        continue;
      }

      let manifest: PluginManifest;
      try {
        manifest = JSON.parse(rawManifest) as PluginManifest;
      } catch (error) {
        next.set(fallbackId, this.brokenPlugin(fallbackId, folder, `manifest.json 解析失败：${String(error)}`));
        continue;
      }

      const id = normalizeId(String(manifest.id ?? ""), fallbackId);
      const problems: string[] = [];
      if (!manifest.name) problems.push("缺少 name");
      if (!manifest.version) problems.push("缺少 version");
      if (!manifest.main && !manifest.renderer && !(manifest.styles?.length ?? 0)) {
        problems.push("manifest 里没有 main / renderer / styles，这个插件什么都不做");
      }
      const apiVersion = manifest.apiVersion ?? PLUGIN_API_VERSION;
      if (apiVersion > PLUGIN_API_VERSION) {
        problems.push(`需要更新的 NWBP（插件 API v${apiVersion}，当前 v${PLUGIN_API_VERSION}）`);
      }

      const permissions = (manifest.permissions ?? []).filter(p => VALID_PERMISSIONS.includes(p));
      const hasMain = Boolean(manifest.main) && isFile(path.join(folder, String(manifest.main)));
      const hasRenderer = Boolean(manifest.renderer) && isFile(path.join(folder, String(manifest.renderer)));
      if (manifest.main && !hasMain) problems.push(`main 指向的文件不存在：${manifest.main}`);
      if (manifest.renderer && !hasRenderer) problems.push(`renderer 指向的文件不存在：${manifest.renderer}`);

      const styles = (manifest.styles ?? []).filter(s => isFile(path.join(folder, String(s))));

      next.set(id, {
        info: {
          id,
          folder,
          manifest: { ...manifest, id },
          enabled: state.enabled[id] ?? true,
          running: false,
          error: problems.length ? problems.join("；") : undefined,
          hasMain,
          hasRenderer,
          styles,
          permissions,
        },
        css: [],
        code: "",
        handlers: new Map(),
        commands: [],
      });
    }

    // 已经卸载的插件从状态文件里顺手清掉，免得越攒越多
    const alive = new Set(next.keys());
    const pruned = Object.fromEntries(Object.entries(state.enabled).filter(([id]) => alive.has(id)));
    this.writeState({ enabled: pruned });

    this.plugins.clear();
    for (const [id, plugin] of next) this.plugins.set(id, plugin);
  }

  private brokenPlugin(id: string, folder: string, error: string): LoadedPlugin {
    return {
      info: {
        id,
        folder,
        manifest: null,
        enabled: false,
        running: false,
        error,
        hasMain: false,
        hasRenderer: false,
        styles: [],
        permissions: [],
      },
      css: [],
      code: "",
      handlers: new Map(),
      commands: [],
    };
  }

  /* -------------------------------------------------------------- 启动/停止 */

  private setRuntimeError(plugin: LoadedPlugin, error: unknown) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    plugin.info.runtimeError = message;
    log.error(`[plugin:${plugin.info.id}]`, message);
  }

  /** 读注入资源（CSS / 渲染端脚本），随加载一起做，失败不影响主进程入口 */
  private readAssets(plugin: LoadedPlugin) {
    const { folder, styles, hasRenderer } = plugin.info;
    plugin.css = styles.map(name => readText(path.join(folder, name)) ?? "");
    const rendererFile = plugin.info.manifest?.renderer;
    plugin.code = hasRenderer && rendererFile ? (readText(path.join(folder, rendererFile)) ?? "") : "";
  }

  /** 主进程侧的上下文对象，插件 `main` 入口拿到的就是这个 */
  private buildContext(plugin: LoadedPlugin) {
    const { id, folder, permissions, manifest } = plugin.info;
    const dataDir = path.join(this.dataRoot, id);
    const storeFile = path.join(dataDir, "store.json");

    const assertPermission = (permission: PluginPermission) => {
      if (!permissions.includes(permission)) {
        throw new Error(`插件 ${id} 没有声明 "${permission}" 权限，这个能力不给用`);
      }
    };

    /** 只允许在插件自己的目录 / 数据目录里读写，挡住 `../` 越界 */
    const resolveInside = (base: string, target: string) => {
      const resolved = path.resolve(base, target);
      const root = path.resolve(base);
      if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new Error(`路径越界：${target}`);
      }
      return resolved;
    };

    const readStore = (): Record<string, unknown> => {
      const raw = readText(storeFile);
      if (!raw) return {};
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {};
      }
    };

    const writeStore = (value: Record<string, unknown>) => {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(storeFile, JSON.stringify(value, null, 2), "utf-8");
    };

    return {
      id,
      name: manifest?.name ?? id,
      version: manifest?.version ?? "0.0.0",
      dir: folder,
      dataDir,
      permissions,
      log: (...args: unknown[]) => log.info(`[plugin:${id}]`, ...args),

      /** 读写插件目录下的文件。要存自己的数据请走 store / dataDir。 */
      fs: {
        read: (rel: string) => {
          assertPermission("fs");
          return readText(resolveInside(folder, rel));
        },
        write: (rel: string, content: string) => {
          assertPermission("fs");
          const target = resolveInside(dataDir, rel);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, content, "utf-8");
        },
        exists: (rel: string) => {
          assertPermission("fs");
          return fs.existsSync(resolveInside(folder, rel));
        },
      },

      net: {
        fetch: (url: string, init?: RequestInit) => {
          assertPermission("net");
          return fetch(url, init);
        },
      },

      shell: {
        openExternal: (url: string) => {
          assertPermission("shell");
          return shell.openExternal(url);
        },
        openPath: (target: string) => {
          assertPermission("shell");
          return shell.openPath(resolveInside(folder, target));
        },
      },

      notify: (title: string, body?: string) => {
        assertPermission("notification");
        if (!Notification.isSupported()) return;
        new Notification({ title, body }).show();
      },

      store: {
        get: (key: string) => {
          assertPermission("store");
          return readStore()[key];
        },
        set: (key: string, value: unknown) => {
          assertPermission("store");
          const data = readStore();
          data[key] = value;
          writeStore(data);
        },
        delete: (key: string) => {
          assertPermission("store");
          const data = readStore();
          delete data[key];
          writeStore(data);
        },
      },

      /** 注册一个命令，设置页的插件列表里会列出「运行」按钮 */
      registerCommand: (command: { id: string; title: string; run: () => unknown }) => {
        if (!command?.id || typeof command.run !== "function") return;
        plugin.commands.push({ id: command.id, title: command.title ?? command.id, run: command.run });
      },

      /** 渲染端可以 `nwbp.ipc.invoke("子通道", payload)` 打到主进程 */
      handle: (subChannel: string, handler: (payload: unknown) => unknown) => {
        plugin.handlers.set(subChannel, handler);
      },

      /** 往界面推事件：渲染端 `nwbp.ipc.on("事件名", cb)` 收 */
      broadcast: (event: string, payload?: unknown) => {
        const win = this.getMainWindow();
        if (!win || win.isDestroyed()) return;
        win.webContents.send(channel.plugin.event, { pluginId: id, event, payload } satisfies PluginEventPayload);
      },
    };
  }

  async start(id: string) {
    const plugin = this.plugins.get(id);
    if (!plugin || plugin.info.running || plugin.info.error) return;

    this.readAssets(plugin);
    plugin.info.runtimeError = undefined;

    if (plugin.info.hasMain && plugin.info.manifest?.main) {
      const entry = path.join(plugin.info.folder, plugin.info.manifest.main);
      try {
        /*
         * 用 `import()` 而不是 `require()`：本应用是 `type: module`，
         * 插件入口按 ESM 写最自然。查询串负责绕开模块缓存，否则「重新加载」
         * 拿到的还是上一次的实例。
         */
        const mod = (await import(`${pathToFileURL(entry).href}?v=${Date.now()}`)) as {
          default?: unknown;
          activate?: unknown;
          dispose?: unknown;
        };
        const activate = typeof mod.default === "function" ? mod.default : mod.activate;
        if (typeof activate !== "function") {
          throw new Error("主进程入口没有 export default function activate(ctx)");
        }
        const result = (await (activate as (ctx: unknown) => unknown)(this.buildContext(plugin))) as unknown;
        plugin.dispose =
          typeof result === "function"
            ? (result as () => void)
            : typeof mod.dispose === "function"
              ? (mod.dispose as () => void)
              : undefined;
        plugin.info.running = true;
        log.info(`[plugin:${id}] 主进程入口已启动`);
      } catch (error) {
        this.setRuntimeError(plugin, error);
      }
    }

    plugin.info.enabled = true;
  }

  async stop(id: string) {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    try {
      plugin.dispose?.();
    } catch (error) {
      log.error(`[plugin:${id}] dispose 抛错:`, error);
    }
    plugin.dispose = undefined;
    plugin.handlers.clear();
    plugin.commands = [];
    plugin.info.running = false;
  }

  /** 按当前清单启动所有启用中的插件 */
  async startAll() {
    for (const id of this.plugins.keys()) {
      const plugin = this.plugins.get(id)!;
      if (plugin.info.enabled && !plugin.info.error) await this.start(id);
    }
  }

  async stopAll() {
    for (const id of this.plugins.keys()) await this.stop(id);
  }

  /* ------------------------------------------------------------------ 查询 */

  list(): PluginInfo[] {
    return [...this.plugins.values()].map(p => p.info).sort((a, b) => a.id.localeCompare(b.id));
  }

  getBundle(): PluginRenderBundle[] {
    return [...this.plugins.values()]
      .filter(p => p.info.enabled && !p.info.error)
      .map(p => ({
        id: p.info.id,
        name: p.info.manifest?.name ?? p.info.id,
        version: p.info.manifest?.version ?? "0.0.0",
        permissions: p.info.permissions,
        css: p.css,
        code: p.code,
      }));
  }

  listCommands(): PluginCommandInfo[] {
    return [...this.plugins.values()].flatMap(p =>
      p.commands.map(c => ({
        pluginId: p.info.id,
        pluginName: p.info.manifest?.name ?? p.info.id,
        id: c.id,
        title: c.title,
        from: "main" as const,
      })),
    );
  }

  async runCommand(pluginId: string, commandId: string) {
    const command = this.plugins.get(pluginId)?.commands.find(c => c.id === commandId);
    if (!command) throw new Error(`命令不存在：${pluginId}/${commandId}`);
    return command.run();
  }

  /** 渲染端 → 插件主进程的自定义调用 */
  async invoke(pluginId: string, subChannel: string, payload: unknown) {
    const handler = this.plugins.get(pluginId)?.handlers.get(subChannel);
    if (typeof handler !== "function") {
      throw new Error(`插件 ${pluginId} 没有注册通道 ${subChannel}`);
    }
    return handler(payload);
  }

  /* ------------------------------------------------------------------ 操作 */

  async setEnabled(id: string, enabled: boolean) {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    plugin.info.enabled = enabled;
    const state = this.readState();
    state.enabled[id] = enabled;
    this.writeState(state);

    if (enabled) {
      if (!plugin.info.error) await this.start(id);
    } else {
      await this.stop(id);
    }
    this.notifyRenderer();
  }

  /** 重新扫目录 + 重启全部插件，并让界面重跑注入脚本 */
  async reload() {
    await this.stopAll();
    this.scan();
    await this.startAll();
    this.notifyRenderer();
  }

  /** 把示例插件写进目录（已有就只打开目录），让用户有份能改的模板 */
  installSample() {
    this.ensureDir();
    const folder = path.join(this.dir, "nwbp-hello");
    if (isDir(folder)) return { folder, created: false };
    try {
      for (const [name, content] of Object.entries(SAMPLE_PLUGIN_FILES)) {
        const target = path.join(folder, name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, "utf-8");
      }
      return { folder, created: true };
    } catch (error) {
      log.error("[plugin] 写入示例插件失败:", error);
      throw error;
    }
  }

  openDir() {
    this.ensureDir();
    return shell.openPath(this.dir);
  }

  reveal(id: string) {
    const plugin = this.plugins.get(id);
    if (plugin) shell.showItemInFolder(plugin.info.folder);
  }

  /** 渲染端报回来的脚本错误，记到列表上让人看得见 */
  reportRuntimeError(pluginId: string, message: string) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    plugin.info.runtimeError = message;
    log.error(`[plugin:${pluginId}] 渲染端脚本出错:`, message);
  }

  private notifyRenderer() {
    const win = this.getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(channel.plugin.event, {
      pluginId: "*",
      event: "plugins-changed",
    } satisfies PluginEventPayload);
  }
}

let manager: PluginManager | null = null;

export const getPluginManager = () => manager;

export function registerPluginHandlers(props: { getMainWindow: () => BrowserWindow | null }) {
  manager = new PluginManager(props.getMainWindow);

  ipcMain.handle(channel.plugin.list, () => manager!.list());
  ipcMain.handle(channel.plugin.getBundle, () => manager!.getBundle());
  ipcMain.handle(channel.plugin.listCommands, () => manager!.listCommands());
  ipcMain.handle(channel.plugin.setEnabled, async (_e, id: string, enabled: boolean) => {
    await manager!.setEnabled(id, enabled);
    return manager!.list();
  });
  ipcMain.handle(channel.plugin.reload, async () => {
    await manager!.reload();
    return manager!.list();
  });
  ipcMain.handle(channel.plugin.runCommand, (_e, pluginId: string, commandId: string) =>
    manager!.runCommand(pluginId, commandId),
  );
  ipcMain.handle(channel.plugin.invoke, (_e, pluginId: string, subChannel: string, payload: unknown) =>
    manager!.invoke(pluginId, subChannel, payload),
  );
  ipcMain.handle(channel.plugin.installSample, async () => {
    const result = manager!.installSample();
    /*
     * 刚写进去的插件还在磁盘上没被扫到，顺手重载一次 ——
     * 用户点完按钮就该看到它出现并直接跑起来，而不是还得再点一次「重新加载」。
     */
    if (result.created) await manager!.reload();
    return result;
  });
  ipcMain.handle(channel.plugin.openDir, () => manager!.openDir());
  ipcMain.handle(channel.plugin.reveal, (_e, id: string) => manager!.reveal(id));
  ipcMain.handle(channel.plugin.reportError, (_e, id: string, message: string) =>
    manager!.reportRuntimeError(id, message),
  );

  manager.ensureDir();
  manager.scan();
  void manager.startAll();

  app.on("before-quit", () => {
    void manager?.stopAll();
  });

  return manager;
}
