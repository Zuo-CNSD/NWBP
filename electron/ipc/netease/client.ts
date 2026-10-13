import got from "got";

import { t } from "../../i18n";
import { UserAgent } from "../../network/user-agent";
import { readNeteaseCookie } from "./account";
import { readCookieValue } from "./cookie";
import { eapiDecrypt, toEapiForm, toWeapiForm } from "./crypto";

/**
 * 网易云的请求层。
 *
 * 和项目里其它 api 文件的区别在于：这里每次请求都要**按需带上登录 Cookie**，
 * 而且要把响应里的 Set-Cookie 带回来（扫码登录靠它累积登录态）。
 */

const REFERER = "https://music.163.com/";
const ORIGIN = "https://music.163.com";

export interface NeteaseRawResponse {
  status: number;
  text: string;
  setCookies: string[];
}

interface RequestOptions {
  method?: "GET" | "POST";
  /** 显式指定 cookie；不传则用当前登录态。传空串表示「这次请求不带 cookie」 */
  cookie?: string;
  /** 表单或 weapi 的原始 body */
  body?: string;
  contentType?: string;
  /** 部分接口（专辑详情等）要求带 `os=pc` */
  osPc?: boolean;
}

const baseHeaders = (cookie: string, contentType?: string) => {
  const headers: Record<string, string> = {
    "User-Agent": UserAgent,
    Referer: REFERER,
    Origin: ORIGIN,
  };
  if (cookie) headers.Cookie = cookie;
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
};

const request = async (url: string, options: RequestOptions = {}): Promise<NeteaseRawResponse> => {
  const { method = "GET", body, contentType, osPc } = options;
  const cookie = options.cookie !== undefined ? options.cookie : readNeteaseCookie();
  const cookieHeader = osPc && cookie ? `os=pc; ${cookie}` : osPc ? "os=pc" : cookie;

  const response = await got(url, {
    method,
    headers: baseHeaders(cookieHeader, contentType),
    body,
    timeout: { request: 15000 },
    retry: { limit: 2 },
    throwHttpErrors: false,
    followRedirect: true,
  });

  return {
    status: response.statusCode,
    text: response.body,
    setCookies: response.headers["set-cookie"] ?? [],
  };
};

const parseJson = <T>(raw: NeteaseRawResponse, label: string): T => {
  try {
    return JSON.parse(raw.text) as T;
  } catch {
    throw new Error(t("{0}：响应解析失败", label));
  }
};

export const neteaseGet = async <T>(url: string, options: Omit<RequestOptions, "method" | "body"> = {}) => {
  const raw = await request(url, { ...options, method: "GET" });
  if (raw.status >= 400) throw new Error(t("网易云接口返回 HTTP {0}", raw.status));
  return parseJson<T>(raw, t("网易云"));
};

export const neteaseFormPost = async <T>(
  url: string,
  form: string,
  options: Omit<RequestOptions, "method" | "body" | "contentType"> = {},
) => {
  const raw = await request(url, {
    ...options,
    method: "POST",
    body: form,
    contentType: "application/x-www-form-urlencoded",
  });
  const json = (() => {
    try {
      return JSON.parse(raw.text) as T;
    } catch {
      return null;
    }
  })();
  return { json, setCookies: raw.setCookies, status: raw.status, text: raw.text };
};

/** weapi：body 换成加密后的 params + encSecKey */
export const neteaseWeapiPost = async <T>(
  url: string,
  payload: unknown,
  options: Omit<RequestOptions, "method" | "body"> = {},
) => {
  const raw = await request(url, {
    ...options,
    method: "POST",
    body: toWeapiForm(payload),
    contentType: "application/x-www-form-urlencoded",
  });
  return parseJson<T>(raw, t("网易云"));
};

const EAPI_HOST = "https://interface.music.163.com";

/** eapi 请求头里要求的一组「客户端指纹」字段，缺了会被判成非法客户端 */
const buildEapiHeader = (cookie: string) => {
  const csrf = readCookieValue(cookie, "__csrf") ?? "";
  const musicU = readCookieValue(cookie, "MUSIC_U");
  const musicA = readCookieValue(cookie, "MUSIC_A");

  const header: Record<string, string> = {
    osver: "",
    deviceId: "",
    appver: "8.9.70",
    versioncode: "140",
    mobilename: "",
    buildver: Date.now().toString().slice(0, 10),
    resolution: "1920x1080",
    __csrf: csrf,
    os: "android",
    channel: "",
    requestId: `${Date.now()}_${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(4, "0")}`,
  };

  if (musicU) header.MUSIC_U = musicU;
  if (musicA) header.MUSIC_A = musicA;

  return header;
};

/**
 * eapi：和 weapi 是两套完全不同的加密，别混用。
 *
 * 调用方传 `/api/xxx` 形式的 url —— **摘要里用的就是它**，
 * 实际请求地址要把前缀换成 `/eapi`（这是最容易写错的一处）。
 *
 * 另外三个必须做对、否则必然失败的点：
 *   1. payload 里要额外塞一个 `header` 字段（客户端指纹 + `MUSIC_U`）；
 *   2. Cookie 头**不是**原始 cookie，而是由上面那个 header 拼出来的；
 *   3. 响应体是 **AES-128-ECB 密文**，得解密后才能 JSON.parse。
 */
export const neteaseEapiPost = async <T>(
  url: string,
  payload: Record<string, unknown> = {},
  options: Omit<RequestOptions, "method" | "body" | "contentType"> = {},
) => {
  const cookie = options.cookie !== undefined ? options.cookie : readNeteaseCookie();
  const header = buildEapiHeader(cookie);
  const eapiCookie = Object.entries(header)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  const target = `${EAPI_HOST}${url.replace(/^\/api/, "/eapi")}`;
  const response = await got(target, {
    method: "POST",
    headers: {
      "User-Agent": UserAgent,
      Referer: REFERER,
      Origin: ORIGIN,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: eapiCookie,
    },
    body: toEapiForm(url, { ...payload, header }),
    timeout: { request: 15000 },
    retry: { limit: 2 },
    throwHttpErrors: false,
    // 响应是密文二进制，不能按文本读
    responseType: "buffer",
  });

  if (response.statusCode >= 400) throw new Error(t("网易云接口返回 HTTP {0}", response.statusCode));

  const plain = response.body.toString("utf-8").trimStart().startsWith("{")
    ? response.body.toString("utf-8") // 少数情况服务端直接回明文 JSON
    : eapiDecrypt(response.body);

  return parseJson<T>({ status: response.statusCode, text: plain, setCookies: [] }, t("网易云"));
};

export const neteaseRequestRaw = request;
