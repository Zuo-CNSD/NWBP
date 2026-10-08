/**
 * 液态玻璃（Liquid Glass）外观
 *
 * 思路：HeroUI 的所有面板（Modal / Card / Popover / Dropdown / Drawer）最终都落到
 * Tailwind 的 `.bg-content1` / `.bg-content2` / `.bg-content3` 这些工具类上，
 * 于是只要在 `.liquid-glass` 作用域内统一覆盖这些类的背板透明度、并加上
 * backdrop-filter 与高光边缘，整个应用就变成毛玻璃，不必逐个组件改。
 *
 * 注意：HeroUI 编译出来的写法是
 *   .bg-content1 { background-color: hsl(var(--heroui-content1) / 1) }
 * 变量是被塞进 hsl() 里的"通道值"。所以**不能**把透明度写进变量本身，
 * 否则会拼成 `hsl(0 0% 100% / 0.6 / 1)` 这种非法值而整条声明失效。
 * 因此这里只额外提供 `--glass-alpha-*` 之类的变量，由 app.css 去组合。
 */
import { hexToHsl } from "./color";

/** 背景图可调范围 */
export const MIN_BACKGROUND_BLUR = 0;
export const MAX_BACKGROUND_BLUR = 40;
export const MIN_BACKGROUND_DIM = 0;
export const MAX_BACKGROUND_DIM = 0.8;

/** 玻璃透明度可调范围（越大越透，面板越"薄"） */
export const MIN_GLASS_OPACITY = 0;
export const MAX_GLASS_OPACITY = 100;
export const DEFAULT_GLASS_OPACITY = 65;

/** 玻璃面板参数 */
export interface GlassOptions {
  enabled: boolean;
  isDark: boolean;
  /** 用户自定义的主色（hex），用于渲染壁纸和玻璃高光 */
  primaryColor: string;
  /** 玻璃透明度 0-100，越大越透 */
  glassOpacity?: number;
}

/**
 * 基准面板不透明度。
 *
 * ⚠️ 这组数字刻意压得很低。
 * "毛玻璃"和"液态玻璃"最直观的差别就在这里：
 *   - 毛玻璃：高模糊 + 高白色填充 → 背景被糊成一片奶白，什么都看不清
 *   - 液态玻璃：低模糊 + 极低填充 → 背景清晰可见，只是被玻璃轻微弯折
 * 所以填充值只保留"一点点白雾"，主要靠 backdrop-filter 的模糊/饱和度/折射
 * 以及镜面高光来塑造玻璃感，而不是靠往面板上刷白漆。
 *
 * 这一组数字对应「玻璃透明度 = 65」时的观感，用户滑杆在此基础上整体缩放。
 */
const BASE_ALPHAS = {
  light: {
    // 主面板：留一层"薄水膜"，既有玻璃的通透感，又给深色文字托底
    a1: 0.3,
    a2: 0.26,
    a3: 0.2,
    // bg-default-50/100/200 的 hover 底，要留得住交互反馈
    subtle: 0.16,
    soft: 0.24,
    strong: 0.32,
    overlay: 0.3,
    // 透明窗口模式：桌面不受控，必须厚一些保证文字可读
    t1: 0.5,
    t2: 0.44,
  },
  dark: {
    /*
     * 深色模式的面板必须比浅色模式厚得多。
     * 浅色模式面板是白的、文字是深的，背景越亮文字越清楚；
     * 深色模式正好相反 —— 面板本身是深的，**背景越亮文字越糊**。
     * 所以「深色 + 玻璃」这组要压住透进来的壁纸/背景图，0.44 那档不够：
     * 实测白字只有 4:1，灰色说明文字掉到 1.x:1 基本看不见。
     */
    a1: 0.6,
    a2: 0.54,
    a3: 0.44,
    subtle: 0.1,
    soft: 0.16,
    strong: 0.24,
    overlay: 0.5,
    t1: 0.62,
    t2: 0.56,
  },
};

/**
 * 滑杆值 → 缩放系数。
 * 65（默认）对应 k = 1；越往左越实（最多 1.9 倍），越往右越透。
 *
 * 右边（最透）那端**刻意留了底**：0.45 那档实测下来，
 * 面板薄到滑块轨道与周围只有 1.3:1、未选中的标签也糊进背景里 ——
 * 「最透明」不该等于「看不见控件」。所以收到 0.55 封顶。
 */
const opacityScale = (opacity?: number) => {
  const raw = Number.isFinite(opacity) ? (opacity as number) : DEFAULT_GLASS_OPACITY;
  const t = Math.min(MAX_GLASS_OPACITY, Math.max(MIN_GLASS_OPACITY, raw)) / 100;
  const anchor = DEFAULT_GLASS_OPACITY / 100;

  return t >= anchor ? 1 - ((t - anchor) / (1 - anchor)) * 0.45 : 1 + ((anchor - t) / anchor) * 0.9;
};

const scaleAlpha = (base: number, k: number) => Math.min(0.98, Math.max(0.02, base * k));

/** 由本模块接管的变量，关闭液态玻璃时需要清理 */
export const GLASS_VARIABLES = [
  "--glass-blur",
  "--glass-saturate",
  "--glass-rim",
  "--glass-specular",
  "--glass-shadow",
  "--glass-tint-a",
  "--glass-tint-b",
  "--glass-tint-c",
  "--glass-alpha-1",
  "--glass-alpha-2",
  "--glass-alpha-3",
  "--glass-alpha-subtle",
  "--glass-alpha-soft",
  "--glass-alpha-strong",
  "--glass-alpha-overlay",
  "--glass-alpha-t1",
  "--glass-alpha-t2",
] as const;

/**
 * 把主色转成 HSL 通道串，失败时退回 HeroUI 默认绿
 */
const safePrimary = (primaryColor: string) => {
  try {
    return hexToHsl(primaryColor);
  } catch {
    return "142 69% 58%";
  }
};

export interface GlassResult {
  /** 是否真正启用了玻璃外观 */
  active: boolean;
  /** 壁纸用到的三个色带，供需要时在 JS 侧复用 */
  tints: string[];
}

/**
 * 应用 / 还原液态玻璃样式变量。
 * 变量写在 :root 内联样式上，优先级最高，能盖住 HeroUI 主题的默认值。
 */
export const applyGlassTheme = (style: CSSStyleDeclaration, options: GlassOptions): GlassResult => {
  const { enabled, isDark, primaryColor, glassOpacity } = options;
  const root = document.documentElement;

  // 自定义背景（纯色/图片）不再关闭玻璃，而是由 Theme 决定铺哪一层底衬
  const active = enabled;

  root.classList.toggle("liquid-glass", active);
  root.classList.toggle("liquid-glass-dark", active && isDark);

  if (!active) {
    GLASS_VARIABLES.forEach(key => style.removeProperty(key));
    return { active: false, tints: [] };
  }

  // 模糊量刻意压小：毛玻璃是"糊掉背景"，液态玻璃是"让背景透过来"
  style.setProperty("--glass-blur", "8px");
  /*
   * 透过玻璃看到的背景不该"抢戏"：适度降饱和 + 轻微提亮，
   * 而不是拉高饱和 —— 拉高会让背景比前景还鲜艳，文字就读不清了。
   */
  style.setProperty("--glass-saturate", isDark ? "135%" : "150%");
  style.setProperty("--glass-brightness", isDark ? "1" : "1.03");
  style.setProperty("--glass-contrast", isDark ? "1.04" : "1.02");

  // 用户拖动的「玻璃透明度」在这里统一缩放所有面板透明度
  const k = opacityScale(glassOpacity);
  const base = isDark ? BASE_ALPHAS.dark : BASE_ALPHAS.light;

  style.setProperty("--glass-alpha-1", String(scaleAlpha(base.a1, k)));
  style.setProperty("--glass-alpha-2", String(scaleAlpha(base.a2, k)));
  style.setProperty("--glass-alpha-3", String(scaleAlpha(base.a3, k)));
  style.setProperty("--glass-alpha-subtle", String(scaleAlpha(base.subtle, k)));
  style.setProperty("--glass-alpha-soft", String(scaleAlpha(base.soft, k)));
  style.setProperty("--glass-alpha-strong", String(scaleAlpha(base.strong, k)));
  style.setProperty("--glass-alpha-overlay", String(scaleAlpha(base.overlay, k)));
  // 透明窗口模式用的加厚档位，同样跟随滑杆
  style.setProperty("--glass-alpha-t1", String(scaleAlpha(base.t1, k)));
  style.setProperty("--glass-alpha-t2", String(scaleAlpha(base.t2, k)));

  if (isDark) {
    style.setProperty("--glass-rim", "0 0% 100% / 0.16");
    style.setProperty("--glass-specular", "0 0% 100% / 0.24");
    style.setProperty("--glass-shadow", "0 0% 0% / 0.5");
  } else {
    style.setProperty("--glass-rim", "0 0% 100% / 0.7");
    style.setProperty("--glass-specular", "0 0% 100% / 0.92");
    style.setProperty("--glass-shadow", "240 24% 42% / 0.18");
  }

  // 壁纸色带：主色 + 左右各偏移，形成流动的彩色雾
  const [huePart, satPart] = safePrimary(primaryColor).split(" ");
  const baseHue = Number.parseFloat(huePart);
  const baseSat = Number.parseFloat(satPart);
  const safeHue = Number.isFinite(baseHue) ? baseHue : 142;
  const safeSat = Number.isFinite(baseSat) ? baseSat : 69;

  /*
   * 浅色模式下面板本身是白的，如果底衬也发白，玻璃就完全看不出来。
   * 所以浅色模式用更浓、更暗一点的色（提高饱和度、压低明度），
   * 深色模式则用更亮的色，避免整体发闷。
   */
  const sat = isDark ? Math.min(96, safeSat + 8) : Math.min(100, safeSat + 26);
  const lightnessA = isDark ? 47 : 50;
  const lightnessB = isDark ? 51 : 54;
  const lightnessC = isDark ? 49 : 52;

  const tints = [
    `${safeHue} ${sat}% ${lightnessA}%`,
    `${(safeHue + 46) % 360} ${sat}% ${lightnessB}%`,
    `${(safeHue + 312) % 360} ${sat}% ${lightnessC}%`,
  ];

  style.setProperty("--glass-tint-a", tints[0]);
  style.setProperty("--glass-tint-b", tints[1]);
  style.setProperty("--glass-tint-c", tints[2]);

  return { active: true, tints };
};
