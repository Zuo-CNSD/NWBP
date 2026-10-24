/**
 * 渲染进程侧的插件运行时。
 *
 * 主进程负责「有哪些插件、各自有没有开、给不给权限」，
 * 这里负责把启用中的插件真正装进界面：
 *   1. 注入它们声明的 CSS（`<style data-nwbp-plugin>`）；
 *   2. 把 `renderer` 入口当脚本执行，作用域里塞一个 `nwbp` 对象；
 *   3. 记住每个插件注册的清理函数，重载 / 关闭时按反序调用。
 *
 * 脚本用 `new Function` 跑而不是动态 `import()`：插件代码是**用户随手改的片段**，
 * 不需要模块系统，也不该被 bundler 掺和进来；而且这样能一并把 `nwbp` 当成参数塞进去。
 */

import { addToast } from "@heroui/react";

import { usePlayList } from "@/store/play-list";
import { inspectRequest } from "@shared/security/net-guard";

/** 界面侧注册的命令，设置页会把这些和主进程注册的合并显示 */
interface RendererCommand {
  pluginId: string;
  pluginName: string;
  id: string;
  title: string;
  run: () => unknown;
}

interface BootedPlugin {
  id: string;
  cleanups: (() => void)[];
  commands: RendererCommand[];
}

const ACTIVE: BootedPlugin[] = [];
const STYLE_ATTR = "data-nwbp-plugin";

let booting = false;

const musicSnapshot = () => {
  const state = usePlayList.getState();
  const current = state.list.find(item => item.id === state.playId);
  return {
    id: state.playId,
    title: current?.title ?? "",
    artist: current?.ownerName ?? "",
    cover: current?.cover ?? "",
    duration: current?.duration ?? state.duration ?? 0,
    isPlaying: state.isPlaying,
    volume: state.volume,
    isMuted: state.isMuted,
    rate: state.rate,
  };
};

const safe = (pluginId: string, fn: () => void) => {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(`[plugin:${pluginId}]`, error);
    void window.electron?.plugin?.reportError(pluginId, message);
  }
};

/** 界面侧命令注册表，供设置页列出并手动运行 */
export const getRendererCommands = (): RendererCommand[] => ACTIVE.flatMap(p => p.commands);

export const runRendererCommand = async (pluginId: string, commandId: string) => {
  const command = ACTIVE.find(p => p.id === pluginId)?.commands.find(c => c.id === commandId);
  if (!command) throw new Error(`命令不存在：${pluginId}/${commandId}`);
  return command.run();
};

const createApi = (bundle: PluginRenderBundle): Record<string, unknown> => {
  const record: BootedPlugin = { id: bundle.id, cleanups: [], commands: [] };
  const has = (permission: PluginPermission) => bundle.permissions.includes(permission);

  const requirePermission = (permission: PluginPermission) => {
    if (!has(permission)) {
      throw new Error(`插件 ${bundle.id} 没有声明 "${permission}" 权限，这个能力不给用`);
    }
  };

  const storageKey = (key: string) => `nwbp:plugin:${bundle.id}:${key}`;

  const api = {
    id: bundle.id,
    name: bundle.name,
    version: bundle.version,

    log: (...args: unknown[]) => console.log(`[plugin:${bundle.id}]`, ...args),

    /** 运行时再补一段 CSS（manifest 里的 styles 是启动时注入的） */
    css: (text: string) => {
      requirePermission("ui");
      const style = document.createElement("style");
      style.setAttribute(STYLE_ATTR, bundle.id);
      style.textContent = text;
      document.head.appendChild(style);
      record.cleanups.push(() => style.remove());
    },

    dom: {
      query: <T extends Element = Element>(selector: string) => {
        requirePermission("ui");
        return document.querySelector<T>(selector);
      },
      queryAll: <T extends Element = Element>(selector: string) => {
        requirePermission("ui");
        return Array.from(document.querySelectorAll<T>(selector));
      },
      /**
       * 盯住某个选择器的元素出现 / 消失。
       * 界面是 React 渲染的，插件没法知道什么时候该重挂自己的节点，
       * 所以给一个 MutationObserver 包装，省得每个插件都自己写一遍。
       */
      observe: (selector: string, callback: (element: Element) => void) => {
        requirePermission("ui");
        const seen = new WeakSet<Element>();
        const check = () => {
          document.querySelectorAll(selector).forEach(element => {
            if (seen.has(element)) return;
            seen.add(element);
            safe(bundle.id, () => callback(element));
          });
        };
        const observer = new MutationObserver(check);
        observer.observe(document.body, { childList: true, subtree: true });
        check();
        record.cleanups.push(() => observer.disconnect());
        return () => observer.disconnect();
      },
    },

    /** 插件被卸载（关闭 / 重新加载 / 退出）时调用 */
    onCleanup: (fn: () => void) => {
      if (typeof fn === "function") record.cleanups.push(fn);
    },

    commands: {
      register: (id: string, title: string, run: () => unknown) => {
        if (!id || typeof run !== "function") return;
        record.commands.push({ pluginId: bundle.id, pluginName: bundle.name, id, title: title || id, run });
      },
    },

    toast: (title: string) => {
      if (!title) return;
      addToast({ title, timeout: 2500 });
    },

    storage: {
      get: (key: string) => {
        try {
          const raw = localStorage.getItem(storageKey(key));
          return raw === null ? undefined : (JSON.parse(raw) as unknown);
        } catch {
          return undefined;
        }
      },
      set: (key: string, value: unknown) => {
        try {
          localStorage.setItem(storageKey(key), JSON.stringify(value));
        } catch (error) {
          console.warn(`[plugin:${bundle.id}] 存储写入失败`, error);
        }
      },
    },

    music: {
      getState: () => {
        requirePermission("music");
        return musicSnapshot();
      },
      /** 播放状态变化时回调；返回取消订阅函数（卸载时会自动取消） */
      subscribe: (callback: (state: ReturnType<typeof musicSnapshot>) => void) => {
        requirePermission("music");
        /*
         * 去重是**每个订阅各自一份**：zustand 的 subscribe 是「任何字段变化都通知」，
         * 进度条在跑的时候每帧都会触发。用模块级的变量去重会让第二个订阅的插件
         * 永远收不到之前已经推过的状态。
         */
        let last = "";
        const unsubscribe = usePlayList.subscribe(() => {
          const snapshot = musicSnapshot();
          const serialized = JSON.stringify(snapshot);
          if (serialized === last) return;
          last = serialized;
          safe(bundle.id, () => callback(snapshot));
        });
        record.cleanups.push(unsubscribe);
        return unsubscribe;
      },
      play: () => {
        requirePermission("music");
        if (!usePlayList.getState().isPlaying) usePlayList.getState().togglePlay();
      },
      pause: () => {
        requirePermission("music");
        if (usePlayList.getState().isPlaying) usePlayList.getState().togglePlay();
      },
      toggle: () => {
        requirePermission("music");
        usePlayList.getState().togglePlay();
      },
      next: () => {
        requirePermission("music");
        return usePlayList.getState().next();
      },
      prev: () => {
        requirePermission("music");
        return usePlayList.getState().prev();
      },
    },

    ipc: {
      invoke: (subChannel: string, payload?: unknown) => window.electron.plugin.invoke(bundle.id, subChannel, payload),
      /** 收主进程那边 `ctx.broadcast(...)` 推来的事件 */
      on: (event: string, callback: (payload: unknown) => void) => {
        const dispose = window.electron.plugin.onEvent(payload => {
          if (payload.pluginId !== bundle.id || payload.event !== event) return;
          safe(bundle.id, () => callback(payload.payload));
        });
        record.cleanups.push(dispose);
        return dispose;
      },
    },
  };

  // api 建完才知道 record，把它挂到模块级的活动列表上
  ACTIVE.push(record);
  return api;
};

/**
 * 插件脚本的执行环境。
 *
 * 做法是**遮蔽而不是隔离**：把 `window` / `document` / `fetch` 这几个入口换成
 * 一层代理，插件拿到的作用域里看不到 `window.electron`、读不到 `document.cookie`、
 * 网络请求先过一遍出口管控。
 *
 * 要说清楚的是：**这不是沙箱**。插件里 `Function("return this")()` 仍然能摸到真身。
 * 这套东西的价值在于两件事：
 *   1. 凭据从正常 API 面里被彻底拿走 —— 插件没法「顺手」拿到，只能明目张胆地绕；
 *   2. 顺手绕的代码会被静态扫描标出来，装之前就看得见。
 */
const HIDDEN_WINDOW_KEYS = new Set([
  "electron",
  "require",
  "process",
  "module",
  "globalThis",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "fetch",
]);

const buildSandbox = (pluginId: string) => {
  const warn = (what: string) => console.warn(`[plugin:${pluginId}] 不允许访问 ${what}`);

  const guardedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const verdict = inspectRequest(url, init);
    if (!verdict.allowed) {
      warn(`网络请求 ${verdict.target}（${verdict.reason}）`);
      return Promise.reject(new Error(`请求被拦截：${verdict.reason}`));
    }
    return window.fetch(input, init);
  };

  const sandboxWindow = new Proxy(window, {
    get(target, prop) {
      if (typeof prop === "string" && HIDDEN_WINDOW_KEYS.has(prop)) {
        warn(`window.${prop}`);
        return undefined;
      }
      /*
       * receiver 必须传 `target` 本身，**不能传代理**。
       * 像 `window.location`、`window.document` 这些是带 brand check 的访问器，
       * 用代理当 receiver 会抛 `TypeError: Illegal invocation` —— Beta 8 走查时实测到。
       */
      const value = Reflect.get(target, prop, target);
      // 方法同样绑到真身：`window.addEventListener` 在代理上调用也会抛非法调用
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  const sandboxDocument = new Proxy(document, {
    get(target, prop) {
      if (prop === "cookie") {
        warn("document.cookie");
        return "";
      }
      // 同 window 那处：receiver 用真身，否则 `document.body` 之类会抛非法调用
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, prop, value) {
      if (prop === "cookie") {
        warn("document.cookie");
        return true;
      }
      return Reflect.set(target, prop, value);
    },
  });

  return { sandboxWindow, sandboxDocument, guardedFetch };
};

const clearInjected = () => {
  while (ACTIVE.length) {
    const plugin = ACTIVE.pop();
    if (!plugin) break;
    for (const cleanup of plugin.cleanups.reverse()) safe(plugin.id, cleanup);
  }
  document.querySelectorAll(`style[${STYLE_ATTR}]`).forEach(node => node.remove());
};

/** 拉一次插件包并装进界面。重复调用会先卸掉上一轮。 */
export const bootPlugins = async () => {
  if (booting) return;
  const bridge = window.electron?.plugin;
  if (!bridge) return;

  booting = true;
  try {
    const bundles = await bridge.getBundle();
    clearInjected();

    for (const bundle of bundles) {
      /*
       * 1) 样式先注入：脚本里查询样式相关属性时能拿到最终值。
       *
       * manifest 里 `styles` 声明的文件**不检查 `ui` 权限** —— 它们是插件包自带的静态文件，
       * 用户装之前就能在设置页的权限标签旁看到「注入界面」这一项。`ui` 管的是**运行时**
       * 的 `nwbp.css()` / `nwbp.dom`（能读能改任意页面内容的那部分）。
       * 否则「只有一个 style.css 的换肤插件」还得先声明一堆它用不到的能力。
       */
      for (const css of bundle.css) {
        if (!css.trim()) continue;
        const style = document.createElement("style");
        style.setAttribute(STYLE_ATTR, bundle.id);
        style.textContent = css;
        document.head.appendChild(style);
      }

      // 2) 脚本
      if (!bundle.code.trim()) continue;
      const api = createApi(bundle);
      try {
        const { sandboxWindow, sandboxDocument, guardedFetch } = buildSandbox(bundle.id);
        const run = new Function(
          "nwbp",
          "window",
          "document",
          "globalThis",
          "fetch",
          `"use strict";\n${bundle.code}\n`,
        );
        run(api, sandboxWindow, sandboxDocument, sandboxWindow, guardedFetch);
      } catch (error) {
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
        console.error(`[plugin:${bundle.id}] 注入脚本执行失败`, error);
        void bridge.reportError(bundle.id, message);
      }
    }
  } catch (error) {
    console.error("[plugin] 加载插件失败", error);
  } finally {
    booting = false;
  }
};

let listening = false;

/** 启动时调一次：装一遍插件，并订阅「插件变了」以便热重载 */
export const setupPlugins = () => {
  void bootPlugins();
  if (listening || !window.electron?.plugin) return;
  listening = true;
  window.electron.plugin.onEvent(payload => {
    if (payload.event === "plugins-changed") void bootPlugins();
  });
};
