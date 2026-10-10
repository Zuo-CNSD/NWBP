import { throttle } from "es-toolkit";

/**
 * 造一个「把最新值按节奏送出去」的推送器。
 *
 * 为什么需要：拖动滑块时 `onChange` 是**每帧**都在触发的，而每次推送都要走一趟
 * IPC（跨进程）再到主进程写设置 —— 每帧一次纯属浪费。按 `waitMs` 合并之后
 * 依旧跟手（60ms ≈ 4 帧），但把往返次数压下一个量级。
 *
 * 两个语义上的保证：
 *  - **末次一定送达**：`throttle` 的 trailing 会把停下来之后的最新值补发出去，
 *    所以不会出现「停在中间某个值上」；
 *  - `flush()` 立刻补发，供组件卸载时调用（否则「拖到一半切走页面」会丢掉最后的值）。
 */
export const createThrottledPush = <T>(push: (value: T) => void, waitMs = 60) => {
  let latest: T | undefined;
  let pending = false;

  const run = throttle(() => {
    if (!pending) return;
    pending = false;
    push(latest as T);
  }, waitMs);

  return {
    /** 攒下最新值，并让推送器按节奏送出去 */
    send: (value: T) => {
      latest = value;
      pending = true;
      run();
    },
    /** 立刻补发还没到点的值 */
    flush: () => {
      run.flush();
    },
  };
};
