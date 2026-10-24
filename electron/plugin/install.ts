import log from "electron-log";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { getUserDataPath } from "../utils";
import { scanPluginFolder } from "./security/scan";

/**
 * 从压缩包 / 链接安装插件。
 *
 * 设计原则：**先解压到一个谁也不认识的地方，检查完再搬进插件目录。**
 * 直接往 `plugins/` 里解压会带来两个问题：
 *   1. 解压失败会留下半拉文件夹，下次启动被当成「坏插件」报错；
 *   2. 恶意的目录名（`../../xxx`）能在 mv 之前就写到别处去。
 *
 * 另外不做「覆盖安装」：目标 id 已存在就拒绝，让用户自己先删。
 * 覆盖等于把「用户正在用的插件」换成包里那个，这一步不该由安装器替他决定。
 */

const MAX_ARCHIVE_BYTES = 60 * 1024 * 1024;
const TMP_ROOT = "plugin-install-tmp";
const SOURCE_FILE = "plugin-sources.json";

const isFile = (p: string) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

const run = (cmd: string, args: string[]) =>
  new Promise<number>(resolve => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr?.on("data", () => {
      /* 吞掉，只看退出码 */
    });
    child.on("error", () => resolve(-1));
    child.on("close", code => resolve(code ?? -1));
  });

/**
 * 解压。三个工具按平台优先级试：
 *  - macOS：`ditto -x -k` 是系统自带且能正确处理中文文件名；
 *  - Windows 10+：自带 `tar`（bsdtar）能读 zip；
 *  - Linux：`unzip` 最常见，没有就退回 `tar`。
 * 都失败就明确告诉用户「系统没有解压工具」，不假装成功。
 */
const extract = async (archive: string, dest: string) => {
  fs.mkdirSync(dest, { recursive: true });

  const candidates: [string, string[]][] =
    process.platform === "darwin"
      ? [
          ["ditto", ["-x", "-k", archive, dest]],
          ["unzip", ["-qq", "-o", archive, "-d", dest]],
        ]
      : process.platform === "win32"
        ? [["tar", ["-xf", archive, "-C", dest]]]
        : [
            ["unzip", ["-qq", "-o", archive, "-d", dest]],
            ["tar", ["-xf", archive, "-C", dest]],
          ];

  for (const [cmd, args] of candidates) {
    if ((await run(cmd, args)) === 0) return;
  }
  throw new Error("解压失败：系统里没有可用的解压工具（ditto / unzip / tar）");
};

/** manifest 可能在根目录，也可能被多套了一层 </pid>/ 目录 —— 两种都认 */
const findManifestRoot = (dir: string): string | null => {
  if (isFile(path.join(dir, "manifest.json"))) return dir;
  const subDirs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "__MACOSX");
  if (subDirs.length === 1) {
    const sub = path.join(dir, subDirs[0].name);
    if (isFile(path.join(sub, "manifest.json"))) return sub;
  }
  return null;
};

/** 拒绝含符号链接的包 —— 常见的「解压后指向系统目录」手法 */
const assertNoSymlink = (dir: string) => {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error("压缩包里含符号链接，已拒绝安装");
      if (entry.isDirectory()) stack.push(full);
    }
  }
};

const normalizeId = (raw: string, fallback: string) => {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
};

const sourcesFile = () => path.join(getUserDataPath(), SOURCE_FILE);

export const readSourceMap = (): Record<string, PluginSourceInfo> => {
  try {
    return JSON.parse(fs.readFileSync(sourcesFile(), "utf-8")) as Record<string, PluginSourceInfo>;
  } catch {
    return {};
  }
};

const writeSourceMap = (map: Record<string, PluginSourceInfo>) => {
  try {
    fs.writeFileSync(sourcesFile(), JSON.stringify(map, null, 2), "utf-8");
  } catch (error) {
    log.error("[plugin] 写来源记录失败:", error);
  }
};

export const forgetSource = (id: string) => {
  const map = readSourceMap();
  if (!(id in map)) return;
  delete map[id];
  writeSourceMap(map);
};

/**
 * 把已经落在磁盘上的压缩包装成插件。
 *
 * `archivePath` 由调用方准备好（文件选择框给本地路径，URL 安装先下载到临时文件），
 * 这里只负责解压、校验、扫描、搬运。
 */
export const installFromArchive = async (props: {
  archivePath: string;
  pluginsDir: string;
  source: PluginSourceInfo;
}): Promise<PluginInstallResult> => {
  const { archivePath, pluginsDir, source } = props;

  const stat = fs.statSync(archivePath);
  if (stat.size > MAX_ARCHIVE_BYTES) {
    throw new Error(`安装包太大（${Math.round(stat.size / 1024 / 1024)}MB，上限 60MB）`);
  }

  const tmp = fs.mkdtempSync(path.join(getUserDataPath(), `${TMP_ROOT}-`));
  try {
    const unpacked = path.join(tmp, "unpacked");
    await extract(archivePath, unpacked);
    assertNoSymlink(unpacked);

    const root = findManifestRoot(unpacked);
    if (!root) throw new Error("这个压缩包里没有 manifest.json，不是 NWBP 插件");

    let manifest: PluginManifest;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf-8")) as PluginManifest;
    } catch (error) {
      throw new Error(`manifest.json 解析失败：${String(error)}`);
    }

    if (!manifest.id) throw new Error("manifest.json 缺少 id");
    const id = normalizeId(String(manifest.id), "");

    // 只允许落到 plugins/ 的直接子目录，杜绝 `../` 之类
    if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) {
      throw new Error(`插件 id 不合法：${manifest.id}`);
    }

    const target = path.join(pluginsDir, id);
    if (fs.existsSync(target)) {
      throw new Error(`已经有一个叫 ${id} 的插件了，先删掉它再装`);
    }

    // 装之前先扫：被拦的插件也要落地（用户能看见、能删），但默认不启用
    const files: { name: string; kind: "main" | "renderer" | "styles" | "manifest" }[] = [
      { name: "manifest.json", kind: "manifest" },
    ];
    if (manifest.main && isFile(path.join(root, manifest.main))) {
      files.push({ name: String(manifest.main), kind: "main" });
    }
    if (manifest.renderer && isFile(path.join(root, manifest.renderer))) {
      files.push({ name: String(manifest.renderer), kind: "renderer" });
    }
    for (const style of manifest.styles ?? []) {
      if (isFile(path.join(root, String(style)))) files.push({ name: String(style), kind: "styles" });
    }
    const security = scanPluginFolder(root, files);

    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.cpSync(root, target, { recursive: true });

    const map = readSourceMap();
    map[id] = { ...source, installedAt: Date.now() };
    writeSourceMap(map);

    log.info(`[plugin] 已安装 ${id}（来源 ${source.kind}${source.from ? `: ${source.from}` : ""}）`);

    return {
      id,
      name: manifest.name ?? id,
      level: security.level,
      blocked: security.blocked,
      findings: security.findings.length,
      disabled: security.blocked,
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

/** 下载远程 zip 到临时文件。只接受 http(s)，大小边下边数，超限立即掐断。 */
export const downloadArchive = async (url: string): Promise<string> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("链接格式不对");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("只支持 http / https 链接");
  }

  const response = await fetch(parsed, { redirect: "follow" });
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);

  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_ARCHIVE_BYTES) {
    throw new Error(`安装包太大（${Math.round(length / 1024 / 1024)}MB，上限 60MB）`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) throw new Error("安装包超过 60MB，已中止");

  const file = path.join(getUserDataPath(), `${TMP_ROOT}-${Date.now()}.zip`);
  fs.writeFileSync(file, buffer);
  return file;
};
