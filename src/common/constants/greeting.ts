/**
 * 主页问候语。
 *
 * 单独放一个模块（而不是留在 `pages/home/index.tsx` 里）有两个原因：
 *   1. 这张表里的中文是**词条 key**，不是在模块顶层翻好的文案 ——
 *      必须在渲染时 `t()`，所以这里只导出「查 key」的纯函数；
 *   2. 放这里才能被单测直接 import 检查 —— 这类「用变量当 key」的词条
 *      不会被静态扫描收进词条表，容易漏翻译（漏了不报错，只是显示中文），
 *      需要一条测试兜住。
 */

/** 档位：`hour < end` 就命中这一档。写成 [结束小时, 词条 key] 的数组 */
export const GREETING_BOUNDS: ReadonlyArray<readonly [number, string]> = [
  [5, "夜深了"],
  [9, "早上好"],
  [12, "上午好"],
  [14, "中午好"],
  [18, "下午好"],
  [24, "晚上好"],
];

/** 兜底用「晚上好」：一天里最后一档，比编一个「你好」更贴合场景 */
export const FALLBACK_GREETING = "晚上好";

/** 拿到该小时的问候语**词条 key**（中文原文），调用方自己 `t()` */
export const greetingKeyOf = (hour: number): string =>
  GREETING_BOUNDS.find(([end]) => hour < end)?.[1] ?? FALLBACK_GREETING;
