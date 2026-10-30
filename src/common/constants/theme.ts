import type { ConfigThemes } from "@heroui/react";

/**
 * 主题基础色。
 *
 * 主色是**黑白**，不是品牌绿（Beta 9 之前是 Spotify 那种绿）：
 * 播放器界面里彩色本来就已经够多了（封面、频谱、液态玻璃底衬），
 * 再压一层高饱和绿，主按钮/开关/进度条全在抢眼睛。
 *
 * 用近黑 / 近白而不是纯 #000 / #fff：纯黑当底色时，白色文字和边框的
 * 过渡会显得生硬，`#18181b` 这档留了一点余地，也不至于像深灰那样发灰。
 *
 * 主色上的文字颜色不在这里写死 —— Theme 组件会按主色亮度算一个
 * `--heroui-primary-foreground`，用户换成任何颜色按钮都不会糊成一片。
 */
export const Themes: ConfigThemes = {
  dark: {
    extend: "dark",
    colors: {
      background: "#17181a",
      primary: "#ededed",
    },
  },
  light: {
    extend: "light",
    colors: {
      background: "#ffffff",
      primary: "#18181b",
    },
  },
};

/**
 * 取当前该用的主色。
 *
 * 设置里的 `primaryColor` 留空表示「跟随主题」（Beta 9 起的默认值），
 * 这时候要回落到主题那一档的黑 / 白。**任何**把主色送进 `hexToHsl` 的地方
 * 都得先过这一层 —— 直接把空串喂进去会抛 `Invalid hex color format`，
 * 而它发生在渲染期，一抛就是整页白屏（ErrorBoundary 会吃掉，看起来像路由 404）。
 *
 * 这里刻意不 import `@/common/utils/color`：这个文件会被 Tailwind 的
 * `@plugin './hero.ts'` 用 jiti 直接加载，那条路径**不认 `@/` 别名**，
 * 一旦引入就整份样式编译失败（`Cannot find module '@/common/utils/color'`）。
 * 一行正则不值得为它把构建链搞坏。
 */
const HEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

export const resolvePrimaryColor = (theme: "light" | "dark", setting?: string): string => {
  const fromTheme = Themes[theme]?.colors?.primary;
  const fallback = typeof fromTheme === "string" && HEX.test(fromTheme) ? fromTheme : "#18181b";

  return HEX.test(setting ?? "") ? (setting as string) : fallback;
};
