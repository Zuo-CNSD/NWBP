import got from "got";

import { UserAgent } from "../../network/user-agent";
import { readNeteaseCookie } from "./account";
import { toWeapiForm } from "./crypto";

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
    throw new Error(`${label}：响应解析失败`);
  }
};

export const neteaseGet = async <T>(url: string, options: Omit<RequestOptions, "method" | "body"> = {}) => {
  const raw = await request(url, { ...options, method: "GET" });
  if (raw.status >= 400) throw new Error(`网易云接口返回 HTTP ${raw.status}`);
  return parseJson<T>(raw, "网易云");
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
  return parseJson<T>(raw, "网易云");
};

export const neteaseRequestRaw = request;
