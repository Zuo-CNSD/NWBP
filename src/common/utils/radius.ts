/**
 * 全局圆角换算
 *
 * HeroUI 内置了三档圆角变量（默认 small 8px / medium 12px / large 14px），
 * 不同组件分别使用不同档位（例如按钮用 medium，卡片/弹窗用 large，部分小控件用 small）。
 * 之前只覆盖了 medium，导致「设置 - 圆角」只能影响一部分控件。
 *
 * 这里按照 HeroUI 默认值之间的比例，从一个基准值推导出三档圆角，
 * 保证任意组件、任意档位都能同步跟随设置变化。
 */
const SMALL_RATIO = 8 / 12;
const LARGE_RATIO = 14 / 12;
/**
 * 窗口圆角：整个应用窗口的四个角。
 *
 * 比「大档」再大一档（16/12）。原因是窗口圆角在视觉上必须**不小于**里面的面板，
 * 否则贴边的侧栏/播放栏会把这圈圆角"吃掉"，看起来就像没圆角。
 * 它同样由「设置 → 圆角」的基准值推导，所以拖滑杆时窗口四个角会跟着一起变。
 */
const WINDOW_RATIO = 16 / 12;

export const DEFAULT_RADIUS = 12;
export const MIN_RADIUS = 0;
export const MAX_RADIUS = 32;

export interface RadiusScale {
  small: number;
  medium: number;
  large: number;
  /** 应用窗口自身四个角的圆角 */
  window: number;
}

/** 由一个基准圆角推导出三档圆角 + 窗口圆角（单位 px，已取整且非负） */
export const resolveRadiusScale = (base?: number): RadiusScale => {
  const safeBase = Number.isFinite(base)
    ? Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(base as number)))
    : DEFAULT_RADIUS;

  return {
    small: Math.round(safeBase * SMALL_RATIO),
    medium: safeBase,
    large: Math.round(safeBase * LARGE_RATIO),
    window: Math.round(safeBase * WINDOW_RATIO),
  };
};

/** 把三档圆角写到 CSS 变量上，同时返回结果便于 JS 侧复用（如弹出层、canvas） */
export const applyRadiusScale = (style: CSSStyleDeclaration, base?: number): RadiusScale => {
  const scale = resolveRadiusScale(base);

  style.setProperty("--heroui-radius-small", `${scale.small}px`);
  style.setProperty("--heroui-radius-medium", `${scale.medium}px`);
  style.setProperty("--heroui-radius-large", `${scale.large}px`);

  // 供非 HeroUI 的原生样式使用（滚动条把手、自定义容器等）
  style.setProperty("--app-radius-small", `${scale.small}px`);
  style.setProperty("--app-radius", `${scale.medium}px`);
  style.setProperty("--app-radius-large", `${scale.large}px`);

  /*
   * 窗口本身的圆角（body / .app-shell 用）。
   * 窗口是 transparent 的，系统不会替我们圆角，全靠这里写出去的值。
   * 以前这里是写死的 10px，导致「圆角」滑杆改了窗口四个角纹丝不动。
   */
  style.setProperty("--window-radius", `${scale.window}px`);

  return scale;
};
