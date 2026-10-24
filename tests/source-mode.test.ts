import { describe, expect, it } from "vitest";

import { resolveSourceVisibility } from "@/common/utils/source-mode";

/**
 * 界面模式换算。
 *
 * 这里钉的是「模式 → 侧栏显示什么、搜索能不能切、喜欢列表去哪」的对应关系。
 * Beta 9 把原来的「首选音乐源二选一」拆成三个模式之后，最容易出的错是
 * **单选模式下还按 `musicSource` 判断** —— 界面里只剩一家，
 * 「我喜欢的音乐」却跳到另一家，用户点进去是一片空白。
 */
describe("界面模式换算", () => {
  it("网易云模式只留网易云", () => {
    const v = resolveSourceVisibility("netease", "bilibili");
    expect(v.showNetease).toBe(true);
    expect(v.showBilibili).toBe(false);
    expect(v.neteaseFirst).toBe(false);
    expect(v.showSourceSwitch).toBe(false);
  });

  it("哔哩哔哩模式只留哔哩哔哩", () => {
    const v = resolveSourceVisibility("bilibili", "netease");
    expect(v.showNetease).toBe(false);
    expect(v.showBilibili).toBe(true);
    expect(v.neteaseFirst).toBe(false);
    expect(v.showSourceSwitch).toBe(false);
  });

  it("融合模式两家都在，且按首选音乐源排先后", () => {
    expect(resolveSourceVisibility("mixed", "netease").neteaseFirst).toBe(true);
    expect(resolveSourceVisibility("mixed", "bilibili").neteaseFirst).toBe(false);

    const v = resolveSourceVisibility("mixed", "netease");
    expect(v.showNetease).toBe(true);
    expect(v.showBilibili).toBe(true);
    expect(v.showSourceSwitch).toBe(true);
  });

  it("单选模式下实际音源由模式决定，不看 musicSource", () => {
    expect(resolveSourceVisibility("netease", "bilibili").activeSource).toBe("netease");
    expect(resolveSourceVisibility("bilibili", "netease").activeSource).toBe("bilibili");
  });

  it("融合模式下实际音源跟着首选音乐源走", () => {
    expect(resolveSourceVisibility("mixed", "netease").activeSource).toBe("netease");
    expect(resolveSourceVisibility("mixed", "bilibili").activeSource).toBe("bilibili");
  });

  it("老存档没有 sourceMode 时按融合处理", () => {
    // Beta 8 及以前只有 musicSource，升级后界面不该突然少一半菜单
    const v = resolveSourceVisibility(undefined, "netease");
    expect(v.showNetease).toBe(true);
    expect(v.showBilibili).toBe(true);
    expect(v.neteaseFirst).toBe(true);
    expect(v.activeSource).toBe("netease");
  });

  it("两个字段都缺失时给一个可用的默认值", () => {
    const v = resolveSourceVisibility(undefined, undefined);
    expect(v.activeSource).toBe("bilibili");
    expect(v.showNetease && v.showBilibili).toBe(true);
  });
});
