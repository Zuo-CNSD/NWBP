/**
 * 版本号的显示格式。
 *
 * `package.json` 里的 version 必须是合法 semver（electron-builder 按它命名产物、
 * 写进 Info.plist / exe 资源），预发布只能写成 `0.1.0-beta.2` 这种。
 * 但界面上这么一串不好看，统一转成「Beta 2」这种读法。
 */

/**
 * 把 semver 的预发布段翻成人话。
 *
 * - `0.1.0-beta.2` → `Beta 2`
 * - `0.1.0-beta` → `Beta`（没写序号就不编造一个）
 * - `1.16.0` → `1.16.0`（没有预发布段就原样返回）
 * - `0.2.0-rc.3` → `Rc 3`（只把首字母大写，不硬编码 beta/alpha，免得将来加了新标记漏改）
 *
 * ⚠️ 显示出来的是**预发布序号**，不是点分的版本核心 ——
 * 所以发新一版时**必须把 `beta` 后面那个数字往上加**（`-beta.2` → `-beta.3` → …），
 * 数字不加的话界面上看起来还是上一版。点分的核心（`0.1.0`）仍然出现在产物名里，
 * 也仍然由 `plugins/electron-build.ts` 写进 macOS `CFBundleVersion` / Windows `FileVersion`。
 *
 * 万一遇到读不出来的形式也原样返回，绝不抛错 —— 版本号是给人看的，不值得为它挂掉一个页面。
 */
export function formatAppVersion(version: string): string {
  const matched = /^(\d+\.\d+\.\d+)-([A-Za-z]+)(?:\.(\d+))?$/.exec(version?.trim() ?? "");
  if (!matched) return version;

  const [, , tag, serial] = matched;
  const label = `${tag.charAt(0).toUpperCase()}${tag.slice(1).toLowerCase()}`;

  return serial ? `${label} ${serial}` : label;
}
