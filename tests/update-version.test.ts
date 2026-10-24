import { describe, expect, test } from "vitest";

import { compareVersions, isNewerVersion } from "@shared/update";

describe("compareVersions", () => {
  test("核心三段按数字比大小，不按字符串", () => {
    expect(compareVersions("0.2.0", "0.1.9")).toBe(1);
    expect(compareVersions("0.1.10-beta.1", "0.1.9-beta.1")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  test("核心相同时，正式版大于预发布版", () => {
    expect(compareVersions("0.1.0", "0.1.0-beta.9")).toBe(1);
    expect(compareVersions("0.1.0-beta.9", "0.1.0")).toBe(-1);
  });

  test("同标记的预发布按序号比", () => {
    expect(compareVersions("0.1.0-beta.10", "0.1.0-beta.9")).toBe(1);
    expect(compareVersions("0.1.0-beta.8", "0.1.0-beta.8")).toBe(0);
  });

  /*
   * 带限定词的补丁版本（`beta.8-hotfix`）。
   *
   * 这里最容易踩的坑是把整段预发布当成一个东西去比字符串：
   * 那样 `beta.9` 会被判成比 `beta.8-hotfix` 旧（"beta" < "beta-hotfix"），
   * 序号大的反而提示不更新。
   */
  test("同一序号上挂 hotfix 的算更新", () => {
    expect(compareVersions("0.1.0-beta.8-hotfix", "0.1.0-beta.8")).toBe(1);
    expect(compareVersions("0.1.0-beta.8", "0.1.0-beta.8-hotfix")).toBe(-1);
    expect(compareVersions("0.1.0-beta.8-hotfix", "0.1.0-beta.8-hotfix")).toBe(0);
  });

  test("序号更大的仍然更大，不会被 hotfix 压过去", () => {
    expect(compareVersions("0.1.0-beta.9", "0.1.0-beta.8-hotfix")).toBe(1);
    expect(compareVersions("0.1.0-beta.8-hotfix", "0.1.0-beta.9")).toBe(-1);
  });

  test("带 v 前缀 / 不完整段也能读", () => {
    expect(compareVersions("v0.1.0-beta.8", "0.1.0-beta.8")).toBe(0);
    expect(compareVersions("0.2", "0.1.0-beta.8")).toBe(1);
  });

  test("读不出来的段按 0 处理，不抛错", () => {
    expect(() => compareVersions("", "0.1.0")).not.toThrow();
    expect(compareVersions("abc", "0.0.0")).toBe(0);
  });
});

describe("isNewerVersion", () => {
  test("远端高一个新版才算有更新", () => {
    expect(isNewerVersion("0.1.0-beta.9", "0.1.0-beta.8")).toBe(true);
    expect(isNewerVersion("0.1.0-beta.8", "0.1.0-beta.8")).toBe(false);
    expect(isNewerVersion("0.1.0-beta.7", "0.1.0-beta.8")).toBe(false);
  });

  test("本地比远端新（自己编译的包）不提示更新", () => {
    expect(isNewerVersion("0.1.0-beta.8", "0.1.0-beta.9")).toBe(false);
  });
});
