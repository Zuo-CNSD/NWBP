/** @type {import('stylelint').Config} */
export default {
  extends: ["stylelint-config-standard"],
  rules: {
    "selector-class-pattern": null,
    "property-no-vendor-prefix": null,
    "function-no-unknown": null,
    "import-notation": null,
    "selector-pseudo-class-no-unknown": [
      true,
      {
        ignorePseudoClasses: ["global"],
      },
    ],
    "block-no-empty": true,
    "color-hex-length": "short",
    /*
     * `src/app.css` 是按「基础 → 主题变体 → 特定窗口」分层写的：
     * 先给默认样式，再用 `html.window-transparent...` 之类的更高优先级选择器覆盖。
     * 这种写法必然出现「高优先级选择器写在前」，强行按升序重排会把同一件事拆散、
     * 还会改变层叠顺序。重复的 `:root` 与 `.bg-content1` 分别是有意的变量分段和二次覆盖。
     */
    "no-descending-specificity": null,
    "no-duplicate-selectors": null,
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: ["extends", "tailwind", "plugin", "source", "custom-variant", "utility"],
      },
    ],
  },
};
