import type { OnBeforeSendHeadersListenerDetails, OnHeadersReceivedListenerDetails } from "electron";

import httpCookie from "cookie";
import { session } from "electron";

import { readNeteaseCookie } from "../ipc/netease/account";
import { UserAgent } from "./user-agent";

const BILIBILI_REFERER = "https://www.bilibili.com";
const NETEASE_REFERER = "https://music.163.com/";

const hostnameOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

const isNeteaseHost = (host: string) =>
  host === "music.163.com" ||
  host.endsWith(".music.163.com") ||
  host.endsWith(".163.com") ||
  host.endsWith(".126.net") ||
  host.endsWith(".music.126.net");

const isBilibiliHost = (host: string) =>
  host.endsWith("bilibili.com") || host.endsWith("hdslb.com") || host.endsWith("bilivideo.com");

export function installWebRequestInterceptors() {
  const urls = ["http://*/*", "https://*/*"];

  /*
   * Referer 必须按域名分派。
   * 原来这行是无条件写死 B 站 Referer 的，网易云的封面 CDN 和音频流
   * （music.126.net / 163.com）拿到 B 站 Referer 会直接 403，
   * 表现就是「歌能搜到、封面白块、点了播不出声」。
   */
  const onBeforeSendHeadersHandler = async (
    details: OnBeforeSendHeadersListenerDetails,
    callback: (response: { requestHeaders?: Record<string, string> }) => void,
  ) => {
    const headers = details.requestHeaders || {};
    const host = hostnameOf(details.url);

    if (isNeteaseHost(host)) {
      headers["Referer"] = NETEASE_REFERER;
      headers["Origin"] = NETEASE_REFERER.replace(/\/$/, "");
      // 网易云的音频直链和封面接口对登录态敏感，带上当前账号的 cookie
      const cookie = readNeteaseCookie();
      if (cookie && host === "music.163.com") headers["Cookie"] = cookie;
    } else {
      headers["Referer"] = BILIBILI_REFERER;
      headers["Origin"] = BILIBILI_REFERER; // 与响应注入的 Allow-Origin 保持一致
    }

    headers["User-Agent"] = UserAgent;

    callback({ requestHeaders: headers });
  };

  // 响应头拦截，重写 Set-Cookie 的 SameSite 与 Secure（只为 B 站的跨站登录态）
  const onHeadersReceivedHandler = (
    details: OnHeadersReceivedListenerDetails,
    callback: (response: { responseHeaders?: Record<string, string | string[]> }) => void,
  ) => {
    const responseHeaders = details.responseHeaders || {};

    // 只处理 B 站：把这条规则扩大到所有域名会顺手改掉网易云等下发的 cookie 属性
    if (!isBilibiliHost(hostnameOf(details.url))) {
      callback({ responseHeaders });
      return;
    }

    const setCookieKey = Object.keys(responseHeaders).find(k => k.toLowerCase() === "set-cookie");

    if (!setCookieKey) {
      callback({ responseHeaders });
      return;
    }

    const raw = responseHeaders[setCookieKey.toLowerCase()];
    const cookies = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];

    const rewritten = cookies.map(cookie => {
      const setCookieObject = httpCookie.parseSetCookie(cookie);
      setCookieObject.sameSite = "none";
      setCookieObject.secure = true;

      return httpCookie.stringifySetCookie(setCookieObject);
    });

    responseHeaders[setCookieKey] = rewritten;
    callback({ responseHeaders });
  };

  session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, onBeforeSendHeadersHandler);
  session.defaultSession.webRequest.onHeadersReceived({ urls }, onHeadersReceivedHandler);
}
