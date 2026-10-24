/**
 * 插件网络出口管控。
 *
 * 目标不是「禁止插件上网」——那会让一大半正常插件没法用；
 * 而是**不让用户的凭据跟着请求出去**，顺手挡住几类明显不该由插件发起的请求。
 *
 * 三类拦截：
 *   1. 非 http(s) 协议（`file:` 读本地文件、`data:` 夹带、`blob:` 绕过）；
 *   2. 本机 / 内网 / 云厂商元数据地址（插件没有任何正当理由去敲 169.254.169.254）；
 *   3. 请求里带着**用户凭据特征**（Cookie 头或 body/query 里出现 MUSIC_U 等）。
 *
 * 记录日志时只留 `host + path`，**丢掉 query** —— 不少接口把 token 放在 query 里，
 * 审计日志本身不该成为泄密点。
 */

const CREDENTIAL_MARKERS = ["MUSIC_U=", "SESSDATA=", "bili_jct=", "DedeUserID=", "__csrf=", "authorization: bearer"];

/** 本机与内网：按字符串判定，够用且不会误伤公网域名 */
const PRIVATE_HOSTS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /\.local$/i,
  /^metadata\./i,
];

export interface NetVerdict {
  allowed: boolean;
  /** 记日志用的目标：host + path，不含 query */
  target: string;
  reason?: string;
}

const targetOf = (url: URL) => `${url.host}${url.pathname}`.slice(0, 200);

const containsCredential = (text: string) => {
  const lower = text.toLowerCase();
  return CREDENTIAL_MARKERS.some(marker => lower.includes(marker.toLowerCase()));
};

/** 从 init 里抽出可以检查的文本（body 可能是 string / URLSearchParams / FormData） */
const bodyText = (init?: RequestInit): string => {
  const body = init?.body;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body && typeof body === "object" && "toString" in body) {
    try {
      return String(body);
    } catch {
      return "";
    }
  }
  return "";
};

const headersText = (init?: RequestInit): string => {
  const headers = init?.headers;
  if (!headers) return "";
  if (headers instanceof Headers) {
    // 不用 entries()：这个项目的 DOM lib 版本里没给它声明
    const parts: string[] = [];
    headers.forEach((value, key) => parts.push(`${key}: ${value}`));
    return parts.join("\n");
  }
  if (Array.isArray(headers)) return headers.map(([k, v]) => `${k}: ${v}`).join("\n");
  return Object.entries(headers as Record<string, string>)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
};

export function inspectRequest(rawUrl: string, init?: RequestInit): NetVerdict {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, target: rawUrl.slice(0, 200), reason: "地址无法解析" };
  }

  const target = targetOf(url);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, target, reason: `不允许的协议 ${url.protocol}` };
  }

  if (PRIVATE_HOSTS.some(pattern => pattern.test(url.hostname))) {
    return { allowed: false, target, reason: "本机 / 内网地址，插件没有正当理由访问" };
  }

  if (containsCredential(url.search) || containsCredential(headersText(init)) || containsCredential(bodyText(init))) {
    return { allowed: false, target, reason: "请求里带有账号凭据，已阻止外发" };
  }

  return { allowed: true, target };
}
