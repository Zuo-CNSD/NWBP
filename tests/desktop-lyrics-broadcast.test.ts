import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * 防回归锚点：设置页改样式时，主进程**不能**把状态回推给主窗口。
 *
 * 为什么这里用「读源码」这么朴素的写法：这条链路横跨三个进程
 * （设置页 → 主进程 → 主窗口 / 桌面歌词窗），渲染端预览里根本没有主进程，
 * 端到端测不出来；而它的症状（拖字号时数值鬼畜）又很难从界面上反推回代码。
 * 所以钉一条静态断言，至少保证「回推」那行不会被无意中改回去。
 *
 * 背景（2026-10-09）：设置页拖字号滑块 → notifyStyleChanged → 主进程广播回主窗口 →
 * 主窗口写回 store。这趟异步往返比手指慢，回来的必然是上一帧的旧值，
 * 而 HeroUI 的 Slider 是受控的，于是滑块被反复「拽回」再被手指「拉走」。
 */
const WINDOW_SOURCE = fs.readFileSync(path.resolve(process.cwd(), "electron/ipc/window.ts"), "utf8");

/** 取出某个 ipcMain.handle 的处理函数体（到下一个 handle 为止） */
const handlerBody = (registeredChannel: string) => {
  const start = WINDOW_SOURCE.indexOf(registeredChannel);
  expect(start, `源码里找不到 ${registeredChannel}，这个测试需要跟着更新`).toBeGreaterThan(-1);

  const rest = WINDOW_SOURCE.slice(start);
  const nextHandler = rest.indexOf("ipcMain.handle", 1);
  return nextHandler === -1 ? rest : rest.slice(0, nextHandler);
};

describe("桌面歌词样式广播", () => {
  test("样式变更只推桌面歌词窗，不回推主窗口", () => {
    expect(handlerBody("channel.desktopLyrics.styleChanged, (_event, style")).toContain(
      "broadcastDesktopLyricsState({ toMain: false })",
    );
  });

  test("开关 / 锁定仍然回推两个窗口", () => {
    // 用户可能在歌词条上直接点 × 关掉、或点锁解锁，这两件事只有主进程知道，
    // 主窗口必须收得到，否则设置页会显示过期的开关状态
    expect(handlerBody("channel.desktopLyrics.setEnabled")).toContain("broadcastDesktopLyricsState();");
    expect(handlerBody("channel.desktopLyrics.setLocked")).toContain("broadcastDesktopLyricsState();");
  });
});
