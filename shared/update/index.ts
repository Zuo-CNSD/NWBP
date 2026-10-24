/**
 * 更新检查 / 公告的公共类型与版本比较。
 *
 * 数据来源是仓库根目录的 `latest.json`（见 docs/update-manifest.md），
 * 不直接用 GitHub Releases API —— 那边的 tag 是 `BETA7` 这种，不是 semver，
 * 比不出大小；而且未登录时 60 次/小时的限流对「每次启动都查一次」太紧。
 */

export type AnnouncementLevel = "info" | "warning" | "maintenance";

export interface UpdateAnnouncement {
  /** 稳定标识，用来记「已读」。改内容不改 id，用户就不会重复看到 */
  id: string;
  level?: AnnouncementLevel;
  title: string;
  body?: string;
  /** ISO 日期，只用于展示 */
  date?: string;
  /** 想引导用户点进去的链接（https） */
  link?: string;
}

export interface UpdateDownloads {
  /** GitHub Releases 页面 */
  github?: string;
  /** 国内镜像（NAS 网盘等） */
  mirror?: string;
}

export interface UpdateRelease {
  /** semver，和 package.json 的 version 对齐，例如 0.1.0-beta.8 */
  version: string;
  /** 展示名，例如 NWBP BETA V8.00 */
  name?: string;
  publishedAt?: string;
  /** 更新说明，一条一句，界面上按列表渲染 */
  notes?: string[];
  /** 已知问题，单独一栏，别混进「新增」里 */
  knownIssues?: string[];
  downloads?: UpdateDownloads;
}

export interface UpdateManifest {
  release?: UpdateRelease;
  announcements?: UpdateAnnouncement[];
}

export interface UpdateCheckResult {
  /** 这次请求本身是否成功（失败时 hasUpdate 恒为 false） */
  ok: boolean;
  currentVersion: string;
  hasUpdate: boolean;
  release?: UpdateRelease;
  announcements: UpdateAnnouncement[];
  /** 命中的镜像名，界面上写「来自 jsDelivr」这种 */
  source?: string;
  checkedAt: string;
  /** ok=false 时给用户看的短句 */
  error?: string;
}

/**
 * 版本比较。
 *
 * 只覆盖本项目实际会用到的形式：`0.1.0-beta.8`、`0.1.0-beta.8-hotfix`、`0.1.0`、`1.2.3-rc.1`。
 * 规则按 semver 的口径：先比核心三段，核心相同则**正式版大于预发布版**，
 * 都是预发布时先比标记名再比序号，最后比序号后面挂的限定词（`hotfix` 算补丁，比原版新）。
 *
 * 返回 -1 / 0 / 1。读不出来的段一律当 0，绝不抛错 ——
 * 更新检查失败只是少个提示，不值得让设置页崩掉。
 */
const parseVersion = (version: string) => {
  const raw = (version ?? "").trim().replace(/^v/i, "");
  const [core, ...preParts] = raw.split("-");
  const pre = preParts.join("-");

  const nums = core.split(".").map(n => {
    const parsed = Number.parseInt(n, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  while (nums.length < 3) nums.push(0);

  /*
   * 预发布段后面还能再挂一段限定词（`beta.8-hotfix`）。
   * 不拆出来的话 tag 会变成 `beta-hotfix`，字符串比较就会得出
   * 「`beta.9` 比 `beta.8-hotfix` 旧」这种明显不对的结论。
   */
  const [preBase, ...qualParts] = pre.split("-");
  const qualifier = qualParts.join("-");

  const tag = preBase.replace(/[0-9.]/g, "");
  const serialMatch = /(\d+)\s*$/.exec(preBase);
  const serial = serialMatch ? Number.parseInt(serialMatch[1], 10) : 0;

  return { nums: nums.slice(0, 3), isPre: Boolean(pre), tag, serial, qualifier };
};

export const compareVersions = (a: string, b: string): -1 | 0 | 1 => {
  const left = parseVersion(a);
  const right = parseVersion(b);

  for (let i = 0; i < 3; i += 1) {
    if (left.nums[i] !== right.nums[i]) return left.nums[i] > right.nums[i] ? 1 : -1;
  }

  if (left.isPre !== right.isPre) return left.isPre ? -1 : 1;

  if (left.isPre && right.isPre) {
    if (left.tag !== right.tag) return left.tag > right.tag ? 1 : -1;
    if (left.serial !== right.serial) return left.serial > right.serial ? 1 : -1;
    if (left.qualifier !== right.qualifier) {
      // 同一版号上挂限定词的算补丁，比这一版本身新：`beta.8-hotfix` > `beta.8`
      if (!left.qualifier) return -1;
      if (!right.qualifier) return 1;
      return left.qualifier > right.qualifier ? 1 : -1;
    }
  }

  return 0;
};

/** 远端版本是否比本地新 */
export const isNewerVersion = (remote: string, local: string) => compareVersions(remote, local) > 0;
