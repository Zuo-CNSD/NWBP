/**
 * 主进程侧的取词入口。
 *
 * ⚠️ 这里**故意不 import `./store`**。
 *
 * `electron/legacy-import.ts`、歌词引擎这些模块会被 vitest 直接 import 进来跑单测，
 * 而 `./store` 会一路拖到 `electron/utils.ts`（`app`、`electron-is-dev`）——
 * 那套东西在 Node 测试环境里会直接抛「Not running in an Electron environment」。
 * 所以语言值走**注入**：`./store` 建好 appSettings 之后调 `setMainLanguage()`，
 * 之后设置一变再调一次。这样 `t()` 自己只依赖 `@shared/i18n`，纯数据、随便 import。
 */

import { DEFAULT_LANGUAGE, normalizeLanguage, translate, type Language } from "@shared/i18n";

let current: Language = DEFAULT_LANGUAGE;

/**
 * 语言变化的订阅者。
 *
 * 原生菜单（托盘、任务栏缩略图工具栏）是**建一次就一直挂着**的，
 * 不像桌面歌词右键菜单那样每次弹出都重建 —— 所以它们必须订阅这里，
 * 在语言变化时把菜单重新 build 一遍。
 */
const listeners = new Set<() => void>();

export const onLanguageChange = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 由 `electron/store.ts` 在读取/变更 appSettings 时调用 */
export const setMainLanguage = (value?: null | string): void => {
  const next = normalizeLanguage(value);
  if (next === current) return;

  current = next;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* 某一个订阅者挂了不该影响其它订阅者，也不该影响设置写入 */
    }
  }
};

export const getLanguage = (): Language => current;

export const t = (key: string, ...args: unknown[]): string => translate(current, key, ...args);

export { DEFAULT_LANGUAGE };
export type { Language };
