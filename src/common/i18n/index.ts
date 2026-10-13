/**
 * 渲染进程侧的取词入口。
 *
 * 主进程那份在 `electron/i18n.ts`（直接从 electron-store 读语言）。
 * 两边共用 `@shared/i18n` 的词典与替换逻辑，只有「语言从哪来」不同。
 *
 * 语言状态存在设置里（`AppSettings.language`），不另开一个 store —— 理由：
 *   1. 主进程要读同一个值来翻原生菜单/托盘，共用 `appSettings` 省掉一次同步；
 *   2. 语言本来就是设置项，放设置页里改最自然。
 *
 * `t` 是**普通函数**而不是 hook，因为大量调用点在事件回调、store action、
 * toast 文案里 —— 那些地方拿不到 hook。代价是模块顶层求值的常量不会随语言变，
 * 所以模块顶层的常量表都改成了「函数按需生成」（见 `constants/menus.tsx` 等）。
 */

import { useSettings } from "@/store/settings";
import { DEFAULT_LANGUAGE, normalizeLanguage, translate, type Language } from "@shared/i18n";

/**
 * 当前语言的内存副本。
 *
 * 有 store 订阅兜底（见文件末尾），但保留一个同步的模块变量，
 * 让 `t()` 在 React 渲染之外（store action、IPC 回调）也能拿到正确语言。
 */
let current: Language = DEFAULT_LANGUAGE;

export const getLanguage = (): Language => current;

export const setLanguage = (language: Language): void => {
  current = normalizeLanguage(language);
};

/**
 * 取词。参数直接跟在 key 后面：
 *   t("播放")
 *   t("共 {0} 首", count)
 */
export const t = (key: string, ...args: unknown[]): string => translate(current, key, ...args);

/** 语言变了就通知 React 重渲染 */
export const useLanguage = (): Language => useSettings(s => normalizeLanguage(s.language));

/** 改语言（写进设置，主进程那边读的是同一份） */
export const useSetLanguage = () => useSettings(s => s.update);

// 初始化 + 订阅：设置里读到的语言立刻反映到 current 上。
current = normalizeLanguage(useSettings.getState().language);
useSettings.subscribe(state => {
  current = normalizeLanguage(state.language);
});

export type { Language };
