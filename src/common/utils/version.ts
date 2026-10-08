/**
 * 版本号的显示格式。
 *
 * `package.json` 里的 version 必须是合法 semver（electron-builder 按它命名产物、
 * 写进 Info.plist / exe 资源），所以预发布只能写成 `0.1.0-beta.1`。
 * 但界面上这么一串不好看，统一转成「Beta V 0.1.0」这种读法。
 */

/**
 * 把 semver 的预发布段翻成人话。
 *
 * - `0.1.0-beta.1` → `Beta V 0.1.0`
 * - `1.16.0` → `1.16.0`（没有预发布段就原样返回）
 * - `0.2.0-rc.3` → `Rc V 0.2.0`（只把首字母大写，不硬编码 beta/alpha，免得将来加了新标记漏改）
 *
 * 万一遇到读不出来的形式也原样返回，绝不抛错 —— 版本号是给人看的，不值得为它挂掉一个页面。
 */
export function formatAppVersion(version: string): string {
  const matched = /^(\d+\.\d+\.\d+)-([A-Za-z]+)(?:\.\d+)?$/.exec(version?.trim() ?? "");
  if (!matched) return version;

  const [, core, tag] = matched;
  return `${tag.charAt(0).toUpperCase()}${tag.slice(1).toLowerCase()} V ${core}`;
}
