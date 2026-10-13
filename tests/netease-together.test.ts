import { describe, expect, test } from "vitest";

import {
  advancePosition,
  buildInvite,
  EPOCH_MS_FLOOR,
  extractInvite,
  isCommandPlaying,
  MAX_ADVANCE_MS,
  normalizeJoinInput,
  parseInvite,
} from "@shared/netease/together";

/**
 * 一起听的纯规则。
 *
 * 这些用例守的都是「查证过、但看起来无关紧要」的细节 —— 每一条都对应一种
 * 整条链路跑不通、但界面上什么错都不报的故障。
 */

const ROOM = "6be6cda6f9b0ff91233f42baf6c79d5d_1790909976";
const INVITER = 17583419505;

describe("邀请码", () => {
  test("拼出来的是 roomId|inviterId 两半", () => {
    expect(buildInvite(ROOM, INVITER)).toBe(`${ROOM}|${INVITER}`);
  });

  test("拆得回来", () => {
    expect(parseInvite(buildInvite(ROOM, INVITER))).toEqual({ roomId: ROOM, inviterId: INVITER });
  });

  test("形状不对的一律拒绝", () => {
    expect(parseInvite("")).toBeNull();
    // 只有房间号 —— 光有它加不进房间，必须拒掉而不是硬发一个不存在的请求
    expect(parseInvite(ROOM)).toBeNull();
    expect(parseInvite(`${ROOM}|`)).toBeNull();
    expect(parseInvite(`${ROOM}|0`)).toBeNull();
    expect(parseInvite(`not-a-room|${INVITER}`)).toBeNull();
    // 连字符不是合法分隔符：拆错了只会拿到「房间不存在」，比直接拒绝更难查
    expect(parseInvite(`${ROOM}-${INVITER}`)).toBeNull();
  });

  test("从一整句话里能抠出来", () => {
    const text = `和我一起听歌吧，房间码：${ROOM}|${INVITER}`;
    expect(extractInvite(text)).toBe(`${ROOM}|${INVITER}`);
    expect(parseInvite(extractInvite(text)!)).toEqual({ roomId: ROOM, inviterId: INVITER });
  });

  test("粘贴时被聊天软件换掉的分隔符能救回来", () => {
    expect(normalizeJoinInput(`${ROOM} ${INVITER}`)).toBe(`${ROOM}|${INVITER}`);
    expect(normalizeJoinInput(`${ROOM}：${INVITER}`)).toBe(`${ROOM}|${INVITER}`);
    expect(normalizeJoinInput(`${ROOM}\n${INVITER}`)).toBe(`${ROOM}|${INVITER}`);
    // 夹在句子里时优先找完整邀请码，而不是按空格拆
    expect(normalizeJoinInput(`码是 ${ROOM}|${INVITER} 哦`)).toBe(`${ROOM}|${INVITER}`);
  });

  test("归一化不做大小写转换（roomId 是小写十六进制）", () => {
    const upper = ROOM.toUpperCase();
    expect(normalizeJoinInput(`${upper}|${INVITER}`)).toBe(`${upper}|${INVITER}`);
  });
});

describe("命令里的进度是快照，不是实时值", () => {
  test("播放中的命令要按 serverSeq 补上流逝的时间", () => {
    const serverSeq = EPOCH_MS_FLOOR + 1000;
    expect(advancePosition(10_000, true, serverSeq, serverSeq + 5000)).toBe(15_000);
  });

  test("暂停中的命令位置不动", () => {
    const serverSeq = EPOCH_MS_FLOOR + 1000;
    expect(advancePosition(10_000, false, serverSeq, serverSeq + 5000)).toBe(10_000);
  });

  test("serverSeq 不可信时按原值返回，不凭空造偏移", () => {
    expect(advancePosition(10_000, true, 0, Date.now())).toBe(10_000);
    expect(advancePosition(10_000, true, 42, Date.now())).toBe(10_000);
  });

  test("往前补的量有上限", () => {
    const serverSeq = EPOCH_MS_FLOOR;
    expect(advancePosition(0, true, serverSeq, serverSeq + MAX_ADVANCE_MS * 10)).toBe(MAX_ADVANCE_MS);
  });

  test("时间倒流不会把进度减回去", () => {
    const serverSeq = EPOCH_MS_FLOOR + 10_000;
    expect(advancePosition(5_000, true, serverSeq, serverSeq - 3_000)).toBe(5_000);
  });
});

describe("哪些命令算在播放", () => {
  test("PLAY / GOTO / NEXT / PREV 都算 —— GOTO 常常带着上一拍的 PAUSE 状态过来", () => {
    expect(isCommandPlaying("GOTO", "PAUSE")).toBe(true);
    expect(isCommandPlaying("NEXT", "PAUSE")).toBe(true);
    expect(isCommandPlaying("PREV", "")).toBe(true);
    expect(isCommandPlaying("PLAY", "")).toBe(true);
  });

  test("显式的 playStatus 也认", () => {
    expect(isCommandPlaying("", "PLAY")).toBe(true);
    expect(isCommandPlaying("", "PLAYING")).toBe(true);
    expect(isCommandPlaying("", "playing")).toBe(true);
  });

  test("只有暂停才算暂停", () => {
    expect(isCommandPlaying("PAUSE", "PAUSE")).toBe(false);
    expect(isCommandPlaying("seek", "PAUSE")).toBe(false);
    expect(isCommandPlaying("", "")).toBe(false);
  });
});
