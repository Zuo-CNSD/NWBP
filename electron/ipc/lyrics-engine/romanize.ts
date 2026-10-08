import { pinyin } from "pinyin-pro";
import { toRomaji } from "wanakana";

/**
 * 歌词音译（移植自 lyrimuse 的 Romanizer，做了「不依赖系统 API」的替换）。
 *
 * lyrimuse 走的是 macOS 的 ICU（`.toLatin`）和 CFStringTokenizer，
 * 这两个 Electron 里都拿不到，所以换成：
 *   - 汉字   → pinyin-pro
 *   - 假名   → wanakana
 *
 * 一个必须处理的坑：**日文歌词里汉字很多**。
 * 如果按「含汉字就出拼音」的路子走，`火曜日の朝は` 会变成
 * `huo yao ri de chao wa` —— 这是最常见的错误结果。
 * 所以先看有没有假名：有假名就整句按日文处理，汉字原样保留（不硬猜读音），
 * 至少不会给出错误读音。真正的日语汉字读音只能靠歌词源自带的罗马音字段。
 */

const KANA = /[\u3040-\u309f\u30a0-\u30ff]/;
const HAN = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const LATIN = /[A-Za-z]/;

/** 只对汉字片段做拼音，其他原样保留，避免把英文单词也转掉 */
const romanizeHan = (text: string) =>
  text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]+/g, run => pinyin(run, { toneType: "symbol", type: "string" }));

/**
 * 给一行歌词生成音译。
 * 已经是纯拉丁文本时直接返回空串，让上层跳过（避免出现一模一样的副行）。
 */
export function romanizeLine(text: string): string {
  const source = String(text ?? "").trim();
  if (!source) return "";

  // 纯英文/数字：没有音译的必要
  if (!HAN.test(source) && !KANA.test(source)) return "";

  if (KANA.test(source)) {
    // 日文（含假名）：只把假名转罗马字，汉字保留
    const romaji = toRomaji(source);
    return romaji.trim() === source ? "" : romaji;
  }

  if (HAN.test(source) && !LATIN.test(source.replace(/[^A-Za-z]/g, ""))) {
    const result = romanizeHan(source);
    return result.trim() === source ? "" : result;
  }

  return "";
}

/** 批量音译，空结果原样返回空串，上层按需过滤 */
export const romanizeLines = (lines: string[]) => lines.map(romanizeLine);
