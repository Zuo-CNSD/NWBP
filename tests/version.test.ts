import { describe, expect, test } from "vitest";

import { formatAppVersion } from "@/common/utils/version";

describe("formatAppVersion", () => {
  test("预发布段翻成「Beta V 0.1.0」", () => {
    expect(formatAppVersion("0.1.0-beta.1")).toBe("Beta V 0.1.0");
  });

  test("没有预发布流水号也能读", () => {
    expect(formatAppVersion("0.1.0-beta")).toBe("Beta V 0.1.0");
  });

  test("大写 / 混合大小写归一化", () => {
    expect(formatAppVersion("0.1.0-BETA.2")).toBe("Beta V 0.1.0");
    expect(formatAppVersion("2.0.0-RC.1")).toBe("Rc V 2.0.0");
  });

  test("稳定版原样返回", () => {
    expect(formatAppVersion("1.16.0")).toBe("1.16.0");
    expect(formatAppVersion("0.1.0")).toBe("0.1.0");
  });

  test("读不出来的形式原样返回，不抛错", () => {
    expect(formatAppVersion("")).toBe("");
    expect(formatAppVersion("v1.2")).toBe("v1.2");
    expect(formatAppVersion("beta-0.1.0")).toBe("beta-0.1.0");
    expect(formatAppVersion(undefined as unknown as string)).toBeUndefined();
  });
});
