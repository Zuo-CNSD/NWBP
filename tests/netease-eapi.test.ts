import crypto from "node:crypto";
import { describe, expect, test } from "vitest";

import { eapi, eapiDecrypt, toEapiForm } from "../electron/ipc/netease/crypto";

/**
 * eapi 加密。
 *
 * 「一起听」那一批接口只认 eapi，而 eapi 跟项目里原有的 weapi 是**两套完全不同的东西**：
 * ECB 无 IV、key 固定、摘要里用 `/api/**` 形式的 url。写错任何一处都不会报错，
 * 只会拿到一个解不开的响应 —— 所以这里用**独立算出的固定向量**把它钉死。
 */

const URL_PATH = "/api/listen/together/room/create";
const PAYLOAD = { refer: "songplay_more" };

/** 按网易云客户端的算法另写一遍算出来的期望值（不是从被测代码里取的） */
const EXPECTED =
  "6E4330E883BF6CFF05B9097AD729A4565D81E6910B4B413E6D60D42D6F7C94C9" +
  "5741E13EA7F535F25D28FD5922DA1AEC43FDBB3A07F0ED306FEA034405BBE3B3" +
  "00E292F71EF4162BA7C6CA797400220F362EE55CB2B6A8E3B931180EDE11354B" +
  "A232C4542EA035C2EF8EE1828B36903FBBC0DDA17A6F69D09ADB00BC244B663B";

describe("eapi 加密", () => {
  test("输出与独立实现的固定向量一致", () => {
    expect(eapi(URL_PATH, PAYLOAD)).toBe(EXPECTED);
  });

  test("输出是大写十六进制、长度是 16 的整数倍", () => {
    const out = eapi(URL_PATH, PAYLOAD);
    expect(out).toMatch(/^[0-9A-F]+$/);
    expect(out.length % 32).toBe(0);
  });

  test("摘要用的是 /api 前缀的 url —— 换成 /eapi 结果就不同", () => {
    expect(eapi("/eapi/listen/together/room/create", PAYLOAD)).not.toBe(EXPECTED);
  });

  test("body 是 params=<hex>，且不用再编码", () => {
    expect(toEapiForm(URL_PATH, PAYLOAD)).toBe(`params=${EXPECTED}`);
  });
});

describe("eapi 响应解密", () => {
  test("用同一把 key 的 AES-128-ECB 能还原出原文", () => {
    const plain = JSON.stringify({ code: 200, data: { roomInfo: { roomId: "abc" } } });
    const key = Buffer.from("e82ckenh8dichen8");
    const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
    const cipherText = Buffer.concat([cipher.update(Buffer.from(plain, "utf-8")), cipher.final()]);

    expect(eapiDecrypt(cipherText)).toBe(plain);
  });

  test("解出来的内容还能继续 JSON.parse", () => {
    const plain = JSON.stringify({ code: 200, data: { inRoom: true } });
    const key = Buffer.from("e82ckenh8dichen8");
    const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
    const cipherText = Buffer.concat([cipher.update(Buffer.from(plain, "utf-8")), cipher.final()]);

    expect(JSON.parse(eapiDecrypt(cipherText))).toEqual({ code: 200, data: { inRoom: true } });
  });
});
