import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * 防回归锚点：网易云收藏必须走 `/api/song/like`，不能走 `/api/radio/like`。
 *
 * 背景（2026-10-10）：用户报「收藏失败：检测到您的网络环境存在风险」。
 * 实测同一份 cookie、同一时刻，两条接口的差别是决定性的：
 *
 *   POST /api/radio/like?alg=itembased&trackId=<id>&like=true
 *     → {"code":-460,"message":"检测到您的网络环境存在风险，请稍后再试"}
 *   POST /api/song/like?trackId=<id>&like=true
 *     → {"code":200,"playlistId":<我喜欢的音乐的歌单 id>}
 *
 * 而且 `radio/like` 换 body 写法救不回来 —— 明文表单 / weapi 加密 / 加 csrf_token /
 * 换 `/weapi` 前缀，四种都是 -460。所以「换接口」是唯一解法，这条断言就是把
 * 「别改回 radio/like」钉在这里。
 *
 * 为什么用「读源码」这种朴素写法：这段代码跑在主进程，而它依赖的 `electron-log` /
 * electron-store 在单测里起不来（和 `desktop-lyrics-broadcast.test.ts` 同一个理由）。
 */
const API_SOURCE = fs.readFileSync(path.resolve(process.cwd(), "electron/ipc/netease/api.ts"), "utf8");

/** 截出 `export const likeSong` 到下一个 `export const` 之间的源码 */
const likeSongBody = () => {
  const start = API_SOURCE.indexOf("export const likeSong");
  expect(start, "源码里找不到 likeSong，这个测试需要跟着更新").toBeGreaterThan(-1);

  const rest = API_SOURCE.slice(start);
  const next = rest.indexOf("export const", 1);
  return next === -1 ? rest : rest.slice(0, next);
};

describe("网易云收藏接口", () => {
  test("走 /api/song/like 而不是被风控的 /api/radio/like", () => {
    const body = likeSongBody();
    expect(body).toContain("/song/like");
    expect(body).not.toContain("radio/like");
  });

  test("用明文表单提交，不套 weapi 加密", () => {
    // /api/song/like 读的是明文 body；套上 weapi 之后 body 变成 params/encSecKey，
    // 服务端看不到 trackId，会直接失败
    const body = likeSongBody();
    expect(body).toContain("neteaseFormPost");
    expect(body).not.toContain("neteaseWeapiPost");
  });

  test("trackId 与 like 同时出现在 query 和 body 里", () => {
    const body = likeSongBody();
    // 同一份表单既拼进 query 也当 body 发（这个接口两边都要）
    expect(body).toContain("trackId=${id}&like=${like}");
    expect(body).toContain("${API}/song/like?${form}");
    expect(body).toContain("neteaseFormPost<");
  });

  test("code 不为 200 时抛出可读错误，并透出网易云的 message", () => {
    const body = likeSongBody();
    expect(body).toContain("res.json?.code !== 200");
    expect(body).toContain("res.json?.message");
  });

  test("用响应里的 playlistId 校正「我喜欢的音乐」缓存", () => {
    // 接口返回的 playlistId 是服务器认定的、这次真正被改动的歌单，
    // 拿它覆盖本地缓存可以顺带修正解析错误（「认成别人歌单」那次的教训）
    const body = likeSongBody();
    expect(body).toContain("playlistId");
    expect(body).toContain("setCachedLikedPlaylistId(playlistId)");
  });
});
