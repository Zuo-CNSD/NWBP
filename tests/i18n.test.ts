import { describe, expect, it } from "vitest";

import { FALLBACK_GREETING, GREETING_BOUNDS } from "@/common/constants/greeting";
import { StatusDesc } from "@/pages/download-list/status-desc";
import { PERMISSION_LABELS, RISK_META, RULE_LABELS, SOURCE_LABELS } from "@/pages/settings/plugin-labels";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_LABELS,
  LANGUAGES,
  countMessages,
  normalizeLanguage,
  translate,
} from "@shared/i18n";
import en from "@shared/i18n/locales/en";
import ja from "@shared/i18n/locales/ja";
import ko from "@shared/i18n/locales/ko";
import zhTW from "@shared/i18n/locales/zh-tw";
import { defaultShortcutSettings } from "@shared/settings/shortcut-settings";

// 主进程侧的取词入口。它刻意零 Electron 依赖，所以在这里可以直接 import
import { getLanguage as getMainLanguage, onLanguageChange, setMainLanguage, t as mainT } from "../electron/i18n";

/**
 * i18n 内核。
 *
 * 这一层的价值全在「查不到时怎么办」—— 词典缺条目是必然会发生的事
 * （新增文案忘了翻、翻译包落后一版），所以**回落行为**比命中行为更值得钉死：
 * 宁可显示中文，也绝不能显示 key 拼接出来的 `undefined` 或者空白。
 */
describe("i18n 内核", () => {
  describe("normalizeLanguage", () => {
    it("认得的语言原样返回", () => {
      for (const language of LANGUAGES) {
        expect(normalizeLanguage(language)).toBe(language);
      }
    });

    it("缺省 / 空值 / 不认识的值都回落到中文", () => {
      for (const value of [undefined, null, "", "fr", "de-DE"]) {
        expect(normalizeLanguage(value)).toBe(DEFAULT_LANGUAGE);
      }
    });

    it("带地区的标签按主语言收敛（zh-Hans-CN → zh-CN，en-US → en）", () => {
      expect(normalizeLanguage("zh-Hans-CN")).toBe("zh-CN");
      expect(normalizeLanguage("en-US")).toBe("en");
      expect(normalizeLanguage("ja-JP")).toBe("ja");
      expect(normalizeLanguage("KO-kr")).toBe("ko");
    });

    /**
     * 中文有两套字形，按主语言（`zh`）去匹配会一律落到排在前面的 `zh-CN`，
     * 所以简繁必须单独判一次。香港 / 澳门系统给的也是繁体，一并收敛到 zh-TW。
     */
    it("繁体中文字标签识别成 zh-TW（含港/澳/Hant 写法）", () => {
      for (const value of ["zh-TW", "zh-tw", "zh-Hant", "zh-Hant-TW", "zh-HK", "zh-MO"]) {
        expect(normalizeLanguage(value)).toBe("zh-TW");
      }
      expect(normalizeLanguage("zh")).toBe("zh-CN");
      expect(normalizeLanguage("zh-Hans")).toBe("zh-CN");
    });
  });

  describe("translate", () => {
    it("中文是基准语言：中文包是空的，查不到就返回原文", () => {
      expect(translate("zh-CN", "播放")).toBe("播放");
      expect(translate("zh-CN", "这条肯定不在词典里")).toBe("这条肯定不在词典里");
    });

    it("英文会走词典", () => {
      expect(translate("en", "播放")).toBe(en["播放"]);
      expect(translate("en", "播放")).not.toBe("播放");
    });

    it("词典缺条目时回落成中文原文，而不是 undefined", () => {
      const missing = "一条故意不存在的词条";
      for (const language of ["en", "ja", "ko"] as const) {
        expect(translate(language, missing)).toBe(missing);
      }
    });

    it("占位符按顺序替换", () => {
      expect(translate("zh-CN", "共 {0} 首", 12)).toBe("共 12 首");
      expect(translate("zh-CN", "{0} · {1}个视频", "系列", 5)).toBe("系列 · 5个视频");
    });

    it("占位符替换**对回落的原文也生效**（中文包为空也能用）", () => {
      // 这条很关键：中文不存词典，靠的就是「返回 key 之后再套替换」
      expect(translate("zh-CN", "还没翻译的 {0}", "占位")).toBe("还没翻译的 占位");
    });

    it("实参给少了就保留占位符原样，不输出 undefined", () => {
      expect(translate("zh-CN", "共 {0} 首 {1}", 3)).toBe("共 3 首 {1}");
    });

    it("实参是 0 / 空串也照常替换（不能被当成「没给」）", () => {
      expect(translate("zh-CN", "共 {0} 首", 0)).toBe("共 0 首");
      expect(translate("zh-CN", "共 {0} 首", "")).toBe("共  首");
    });

    it("没有占位符时实参被忽略", () => {
      expect(translate("zh-CN", "播放", 1, 2)).toBe("播放");
    });

    it("语言标识大小写不敏感", () => {
      expect(translate("EN" as never, "播放")).toBe(en["播放"]);
    });
  });

  describe("语言包完整性", () => {
    /** 英文 / 日文 / 韩文是逐条对齐维护的，条数必须一致 */
    const packs = { en, ja, ko } as const;
    /** 繁体是从简体转出来的，只收「转了才有变化」的条目，条数天然不同 */
    const allPacks = { ...packs, zhTW } as const;

    it("三份词典条数一致", () => {
      const sizes = Object.values(packs).map(pack => Object.keys(pack).length);
      expect(new Set(sizes).size).toBe(1);
      expect(sizes[0]).toBeGreaterThan(600);
    });

    it("繁体包随简体落地（条目数在同一个量级，不是空壳）", () => {
      expect(countMessages("zh-TW")).toBeGreaterThan(600);
      // 少掉的那部分是「简繁同形」的词条（「播放」「下载」）和非中文 key，
      // 它们本来就该走回落，所以比例不能低太多
      expect(countMessages("zh-TW") / countMessages("en")).toBeGreaterThan(0.8);
    });

    it("countMessages 报的是各自包里的条数", () => {
      expect(countMessages("zh-CN")).toBe(0);
      expect(countMessages("en")).toBe(Object.keys(en).length);
    });

    it("占位符必须和中文原文一一对应（少一个就会吞掉数字）", () => {
      const placeholders = (text: string) => (text.match(/\{\d+\}/g) ?? []).sort().join(",");

      const mismatched: string[] = [];
      for (const [language, pack] of Object.entries(allPacks)) {
        for (const [key, value] of Object.entries(pack)) {
          if (placeholders(key) !== placeholders(value)) {
            mismatched.push(`${language}  ${key}  →  ${value}`);
          }
        }
      }

      expect(mismatched).toEqual([]);
    });

    it("没有空译文（空的会渲染成一片空白，比显示中文还糟）", () => {
      const empty: string[] = [];
      for (const [language, pack] of Object.entries(allPacks)) {
        for (const [key, value] of Object.entries(pack)) {
          if (!value.trim()) empty.push(`${language}  ${key}`);
        }
      }

      expect(empty).toEqual([]);
    });
  });

  describe("语言名", () => {
    it("每种语言都有显示名，且用各自的语言书写（不翻译）", () => {
      for (const language of LANGUAGES) {
        expect(LANGUAGE_LABELS[language]).toBeTruthy();
      }

      expect(LANGUAGE_LABELS["zh-CN"]).toBe("简体中文");
      expect(LANGUAGE_LABELS["zh-TW"]).toBe("繁體中文");
      expect(LANGUAGE_LABELS.en).toBe("English");
      expect(LANGUAGE_LABELS.ja).toBe("日本語");
      expect(LANGUAGE_LABELS.ko).toBe("한국어");
    });

    it("语言选择器里五种语言按「中文在前」排", () => {
      expect([...LANGUAGES]).toEqual(["zh-CN", "zh-TW", "en", "ja", "ko"]);
    });
  });

  /**
   * 繁体包是**从简体转换来的**，不是人工翻译，所以要钉住的是「转换真的发生了」。
   * 只验「有条目」不够 —— 转换规则整个失效也会留下几千条一模一样的条目。
   */
  describe("繁体中文包", () => {
    it("繁体包用的是台湾用语，不是只换字形", () => {
      expect(translate("zh-TW", "设置")).toBe("設定");
      expect(translate("zh-TW", "网络")).toBe("網路");
    });

    it("转换后与原文相同的条目不收录，查不到时回落成简体原文", () => {
      // 「播放」简繁同形，不会进词典
      expect(zhTW["播放"]).toBeUndefined();
      expect(translate("zh-TW", "播放")).toBe("播放");
    });

    it("繁体界面的缺词条回落成简体，而不是英文", () => {
      const missing = "一条故意不存在的词条";
      expect(translate("zh-TW", missing)).toBe(missing);
    });

    it("占位符原样保留（转换不能动 {0}）", () => {
      expect(translate("zh-TW", "共 {0} 首", 12)).toContain("12");
      expect(translate("zh-TW", "共 {0} 首", 12)).not.toContain("{0}");
    });
  });

  /**
   * 有几种文案是「用变量当 key」的：`t(StatusDesc[status])`、`t(greetingKeyOf(h))`、
   * `t(item.name)`。它们**不会被静态扫描收进词条表**，所以漏翻译时不会报错、
   * 也不会被上面那组用例发现 —— 只会在界面上默默显示中文。
   *
   * 这组用例把三张表逐个查一遍，专治这一类漏网。
   */
  describe("用变量当 key 的词条（静态扫描收不到，必须逐个查）", () => {
    const packs = { en, ja, ko } as const;

    const assertCovered = (label: string, keys: string[]) => {
      expect(keys.length).toBeGreaterThan(0);

      const missing: string[] = [];
      for (const [language, pack] of Object.entries(packs)) {
        for (const key of keys) {
          if (!pack[key]) missing.push(`${language}  ${key}`);
        }
      }
      expect(missing, `${label} 有词条没翻译`).toEqual([]);
    };

    it("下载状态的每一条都有翻译", () => {
      assertCovered("下载状态", Object.values(StatusDesc));
    });

    it("问候语的每一档都有翻译", () => {
      assertCovered("问候语", [...GREETING_BOUNDS.map(([, key]) => key), FALLBACK_GREETING]);
    });

    it("快捷键名称的每一个都有翻译", () => {
      const names = [...defaultShortcutSettings.shortcuts, ...defaultShortcutSettings.globalShortcuts].map(s => s.name);
      assertCovered("快捷键名称", [...new Set(names)]);
    });

    /**
     * 插件页的四张表都是 `t(表[x])` 渲染的：权限、风险级别、安装来源、扫描规则。
     * 之前这四条一路漏翻 —— 英文界面下插件卡片上「界面 / 网络 / 存储」还是中文。
     */
    it("插件页的权限 / 风险 / 来源 / 规则标签都有翻译", () => {
      assertCovered("插件权限", Object.values(PERMISSION_LABELS));
      assertCovered(
        "插件风险级别",
        Object.values(RISK_META).map(meta => meta.label),
      );
      assertCovered("插件安装来源", Object.values(SOURCE_LABELS));
      assertCovered("插件扫描规则", Object.values(RULE_LABELS));
    });
  });

  /**
   * 主进程那一侧（托盘菜单、任务栏缩略图按钮）不是 React 树里的东西，
   * 语言一改**不会**自动重渲染 —— 只能靠 `setMainLanguage` 主动通知订阅者重建。
   * 这条链子没法在浏览器里点出来，所以钉在单测上。
   */
  describe("主进程侧（electron/i18n）", () => {
    it("语言变化会通知订阅者；值没变就不通知", () => {
      const notified: string[] = [];
      const off = onLanguageChange(() => notified.push(getMainLanguage()));

      setMainLanguage("en");
      setMainLanguage("en"); // 重复设置同一个值，不该再通知
      setMainLanguage("ja");
      setMainLanguage(undefined); // 非法 / 缺失 → 回落中文，也算一次变化

      expect(notified).toEqual(["en", "ja", DEFAULT_LANGUAGE]);

      off();
      setMainLanguage("ko");
      expect(notified).toEqual(["en", "ja", DEFAULT_LANGUAGE]); // 退订之后不再收到

      setMainLanguage(DEFAULT_LANGUAGE); // 还原，避免影响后续用例
    });

    it("某个订阅者抛异常不影响其它订阅者", () => {
      const seen: string[] = [];
      const off1 = onLanguageChange(() => {
        throw new Error("订阅者炸了");
      });
      const off2 = onLanguageChange(() => seen.push(getMainLanguage()));

      expect(() => setMainLanguage("ko")).not.toThrow();
      expect(seen).toEqual(["ko"]);

      off1();
      off2();
      setMainLanguage(DEFAULT_LANGUAGE);
    });

    it("主进程的 t() 用当前语言取词，中文仍是原文", () => {
      setMainLanguage("en");
      expect(mainT("播放")).toBe(en["播放"]);

      setMainLanguage("zh-CN");
      expect(mainT("播放")).toBe("播放");
      expect(mainT("共 {0} 首", 7)).toBe("共 7 首");
    });
  });
});
