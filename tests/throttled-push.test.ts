import { describe, expect, test, vi } from "vitest";

import { createThrottledPush } from "@/common/utils/throttled-push";

/**
 * 这个推送器存在的理由是「拖滑块时别每帧走一趟 IPC」，
 * 所以两条语义必须钉死：**中间能合并**、**末次不能丢**。
 */
describe("createThrottledPush", () => {
  test("密集调用会被合并，但最后一次一定送达", () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const push = createThrottledPush<number>(v => seen.push(v), 60);

    // 模拟拖动：每 10ms 产生一个新值
    for (let i = 0; i < 10; i++) {
      push.send(i);
      vi.advanceTimersByTime(10);
    }
    vi.advanceTimersByTime(200);

    expect(seen.length).toBeLessThan(10); // 确实合并了
    expect(seen.at(-1)).toBe(9); // 松手时的值不会丢
    vi.useRealTimers();
  });

  test("flush 立刻补发还没到点的值（组件卸载时用）", () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const push = createThrottledPush<number>(v => seen.push(v), 60);

    push.send(1); // leading：立刻发
    push.send(2); // 落在节流窗口里，被压住
    expect(seen).toEqual([1]);

    push.flush();
    expect(seen).toEqual([1, 2]);

    // flush 之后不该再补发一次
    vi.advanceTimersByTime(200);
    expect(seen).toEqual([1, 2]);
    vi.useRealTimers();
  });
});
