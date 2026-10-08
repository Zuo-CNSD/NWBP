import { describe, expect, it } from "vitest";

import { albumScore, titleMatchTier, versionTagsMismatch, isCreditOnly, textSimilarity } from "@shared/lyrics/match";
import { normalizeLyrics } from "@shared/lyrics/normalize";
import { alignSideText, parseLyrics, parsePlainLrc, parseWordLyrics } from "@shared/lyrics/parse";

describe("LRC 解析", () => {
  it("一行多个时间戳会各自成一条", () => {
    const { lines } = parsePlainLrc("[00:10.00][01:20.50]同一句歌词");
    expect(lines).toHaveLength(2);
    expect(lines[0].timeMs).toBe(10_000);
    expect(lines[1].timeMs).toBe(80_500);
    expect(lines.every(line => line.text === "同一句歌词")).toBe(true);
  });

  it("读出 [offset:] 标签", () => {
    const { offsetMs, lines } = parsePlainLrc("[offset:+500]\n[00:01.00]你好");
    expect(offsetMs).toBe(500);
    expect(lines).toHaveLength(1);
  });

  it("跳过元数据行与空行", () => {
    const { lines } = parsePlainLrc("[ar:某歌手]\n[ti:某首歌]\n\n[00:02.00]第一句");
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("第一句");
  });

  it("小数位是 1/2/3 位都能算对", () => {
    const { lines } = parsePlainLrc("[00:01.5]a\n[00:02.50]b\n[00:03.500]c");
    expect(lines.map(line => line.timeMs)).toEqual([1500, 2500, 3500]);
  });
});

describe("逐字歌词解析", () => {
  it("网易云 YRC：词时间是绝对值，标记在词前面", () => {
    const lines = parseWordLyrics("[0,2000](0,500,0)你(500,500,0)好");
    expect(lines).toHaveLength(1);
    expect(lines[0].words.map(word => word.text)).toEqual(["你", "好"]);
    expect(lines[0].words.map(word => word.startMs)).toEqual([0, 500]);
  });

  it("酷狗 KRC：词偏移相对行首，必须换算成绝对值", () => {
    const lines = parseWordLyrics("[1000,2000]<0,500,0>你<500,500,0>好");
    expect(lines[0].words.map(word => word.startMs)).toEqual([1000, 1500]);
  });

  it("QQ QRC：词文本在标记前面", () => {
    const lines = parseWordLyrics("[1000,2000]你(1000,500)好(1500,500)");
    expect(lines[0].words.map(word => word.text)).toEqual(["你", "好"]);
    expect(lines[0].words.map(word => word.startMs)).toEqual([1000, 1500]);
  });

  it("没有逐字格式时不误判", () => {
    expect(parseWordLyrics("[00:01.00]普通歌词")).toHaveLength(0);
  });
});

describe("时间轴归一化", () => {
  /** 整行与逐字的行首时间要对得上（真实来源也是如此），否则逐字会被判为无法配对 */
  const build = (body: string, lineTimes: string[] = ["[00:00.00]"]) => {
    const lrc = lineTimes.map((tag, i) => `${tag}第${i + 1}句`).join("\n");
    return parseLyrics({ lrc, yrc: body });
  };

  it("字时间倒退 → 整行降级（丢掉逐字）", () => {
    // 排序前就是倒退的，必须判为不可信；先排序再比大小会让这条规则永远通过
    const result = normalizeLyrics(build("[0,2000](500,300,0)你(100,300,0)好"));
    expect(result.degradedCount).toBe(1);
    expect(result.lines[0].words).toBeUndefined();
    expect(result.lines[0].text).toBe("第1句");
  });

  it("第一个字比行首早太多 → 整行降级", () => {
    const result = normalizeLyrics(build("[0,2000](-3000,300,0)你(300,300,0)好"));
    expect(result.degradedCount).toBe(1);
  });

  it("最后一个字略微越过下一行 → 夹回下一行开始", () => {
    // 第 2 句在 1000ms，第 1 句的最后一个字到 1200ms，越了 200ms（在 250ms 容差内）
    const result = normalizeLyrics(build("[0,1000](0,400,0)第(400,800,0)一", ["[00:00.00]", "[00:01.00]"]));
    expect(result.degradedCount).toBe(0);

    const words = result.lines[0].words!;
    const last = words[words.length - 1];
    expect(last.startMs + last.durationMs).toBe(1000);
  });

  it("最后一个字越太多 → 整行降级", () => {
    const result = normalizeLyrics(build("[0,1000](0,400,0)第(400,2000,0)一", ["[00:00.00]", "[00:01.00]"]));
    expect(result.degradedCount).toBe(1);
  });

  it("第一个字略早于行首 → 夹回行首", () => {
    const result = normalizeLyrics(build("[500,1000](300,200,0)你(500,200,0)好", ["[00:00.50]"]));
    expect(result.lines[0].words?.[0].startMs).toBe(500);
  });

  it("逐字行比整行晚几十毫秒也能配上", () => {
    // 网易云整行与逐字来自两个接口，时间对不齐是常态
    const result = normalizeLyrics(parseLyrics({ lrc: "[00:00.00]你好", yrc: "[120,1000](120,400,0)你(520,400,0)好" }));
    expect(result.lines[0].words).toBeDefined();
    expect(result.lines[0].text).toBe("你好");
  });

  it("全局 offset 会平移所有行", () => {
    const parsed = parseLyrics({ lrc: "[offset:+1000]\n[00:00.00]你好" });
    const result = normalizeLyrics(parsed);
    expect(result.lines[0].timeMs).toBe(1000);
  });
});

describe("翻译对齐", () => {
  it("按时间精确对齐", () => {
    const map = alignSideText([1000, 2000], {
      lines: [
        { timeMs: 1000, text: "hi" },
        { timeMs: 2000, text: "yo" },
      ],
    });
    expect(map.get(1000)).toBe("hi");
    expect(map.get(2000)).toBe("yo");
  });

  it("时间差在 200ms 内也能对上", () => {
    const map = alignSideText([1000], { lines: [{ timeMs: 1150, text: "hi" }] });
    expect(map.get(1000)).toBe("hi");
  });
});

describe("匹配打分", () => {
  it("版本标签不一致要能识别", () => {
    expect(versionTagsMismatch("某某歌 (Live)", "某某歌")).toBe(true);
    expect(versionTagsMismatch("某某歌 (Live)", "某某歌 (现场)")).toBe(false);
    expect(versionTagsMismatch("某某歌", "某某歌")).toBe(false);
  });

  it("括号里的普通词不会被当成版本标签", () => {
    // (Come Alive) 里的 "come" 不含 live 这个词元，不能误判成现场版
    expect(versionTagsMismatch("Something (Come Alive)", "Something")).toBe(false);
  });

  it("标题档位：完全一致 > 仅括号差异 > 双语小节", () => {
    expect(titleMatchTier("夜曲", "夜曲").points).toBe(120);
    expect(titleMatchTier("夜曲", "夜曲 (Live)").points).toBe(60);
    expect(titleMatchTier("夜曲 / Night Song", "Night Song").points).toBe(30);
  });

  it("专辑亲密度：相等最高，共享词元最低", () => {
    expect(albumScore("范特西", "范特西")).toBe(200);
    expect(albumScore("范特西", "范特西 (Deluxe)")).toBe(100);
    expect(albumScore("Album One", "One")).toBeGreaterThan(0);
  });

  it("只有署名行的歌词会被判为无效", () => {
    expect(
      isCreditOnly([
        { timeMs: 0, text: "作词：某人" },
        { timeMs: 100, text: "作曲：某人" },
      ]),
    ).toBe(true);
    expect(
      isCreditOnly([
        { timeMs: 0, text: "作词：某人" },
        { timeMs: 100, text: "这是一句真歌词" },
      ]),
    ).toBe(false);
  });

  it("相似度能识别同一份歌词", () => {
    const a = "我们一起学猫叫\n一起喵喵喵喵喵";
    const b = "我们一起学猫叫\n一起喵喵喵喵喵";
    expect(textSimilarity(a, b)).toBeGreaterThan(0.9);
    expect(textSimilarity(a, "完全不一样的另一首歌的歌词内容")).toBeLessThan(0.1);
  });
});
