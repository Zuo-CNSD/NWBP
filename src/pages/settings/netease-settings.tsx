import { useCallback, useEffect, useState } from "react";

import { Button, Chip, Skeleton, Textarea, addToast } from "@heroui/react";
import { RiLogoutBoxRLine, RiQrCodeLine, RiRefreshLine } from "@remixicon/react";
import { useRequest } from "ahooks";
import { QRCodeCanvas } from "qrcode.react";

import { useNetease } from "@/store/netease";
import { useNeteaseLike } from "@/store/netease-like";

/**
 * 网易云账号设置。
 *
 * 两种登录方式（对应 ncm-player 里的两套逻辑）：
 *  1. **扫码**：向网易云要一个 unikey，把 `login?codekey=xxx` 画成二维码，
 *     然后轮询状态；803 才算成功。注意轮询必须带着前面下发的 cookie，
 *     否则登录态接不上 —— 这一步的 cookie 累积在主进程里做。
 *  2. **粘贴 Cookie**：直接拿用户给的那条去换账号信息，换得到就算有效。
 *
 * Cookie 在主进程里做了消毒（去掉双引号）和按 key 合并，
 * 渲染端只接触「昵称 / 头像 / 是否登录」，不碰明文。
 */

const QR_STATUS_TEXT: Record<number, string> = {
  800: "二维码已过期，点右上角刷新",
  801: "等待扫码…",
  802: "已扫码，请在手机上确认",
  803: "登录成功",
};

const NeteaseSettings = () => {
  const [account, setAccount] = useState<NeteaseAccountInfo | null>(null);

  /**
   * 账号变了（登录 / 退出）时同步两处：
   *  1. 全局 store —— 侧栏那个「网易云」分组要按登录态显示
   *  2. 喜欢的集合 —— 必须强制重拉，否则星星和右键菜单会停在上一个账号的状态
   *
   * 这里用 `useNetease.getState()` 而不是提前 select 出来：函数名和 select 出来的变量
   * 很容易在批量改名时互相覆盖（踩过一次），直接取 state 更稳。
   */
  const syncGlobalAccount = useCallback((info: NeteaseAccountInfo) => {
    useNetease.getState().setAccount(info);
    void useNeteaseLike.getState().refresh({ force: true });
  }, []);
  const [cookieInput, setCookieInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshAccount = useCallback(async () => {
    try {
      setAccount(await window.electron.netease.getAccount());
    } catch {
      setAccount(null);
    }
  }, []);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  // ---- 扫码登录 ----
  const {
    loading: qrLoading,
    data: qrSession,
    refreshAsync: refreshQr,
  } = useRequest(async () => {
    if (account?.loggedIn) return null;
    return window.electron.netease.qrCreate();
  });

  const { data: qrCheck } = useRequest(
    async () => {
      if (!qrSession?.unikey) return null;
      return window.electron.netease.qrCheck(qrSession.unikey);
    },
    {
      ready: Boolean(qrSession?.unikey) && !account?.loggedIn,
      refreshDeps: [qrSession?.unikey],
      pollingInterval: 2000,
      pollingWhenHidden: false,
      onSuccess: async result => {
        if (result?.code === 803 && result.account) {
          setAccount(result.account);
          if (result.account) syncGlobalAccount(result.account);
          addToast({ color: "success", title: `已登录：${result.account.nickname}` });
          return;
        }
        if (result?.code === 800) {
          // 过期就自动换一张，省得用户手动点
          void refreshQr();
        }
      },
    },
  );

  const handleLoginWithCookie = async () => {
    const cookie = cookieInput.trim();
    if (!cookie) {
      addToast({ color: "warning", title: "请先粘贴 Cookie" });
      return;
    }

    setIsSubmitting(true);
    try {
      const info = await window.electron.netease.loginWithCookie(cookie);
      setAccount(info);
      syncGlobalAccount(info);
      setCookieInput("");
      addToast({ color: "success", title: `已登录：${info.nickname}` });
    } catch (error) {
      addToast({
        color: "danger",
        title: "登录失败",
        description: String(error instanceof Error ? error.message : error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    const info = await window.electron.netease.logout();
    setAccount(info);
    syncGlobalAccount(info);
    addToast({ color: "success", title: "已退出网易云账号" });
  };

  return (
    <div className="space-y-5">
      {/* 登录状态 */}
      <div className="flex items-center justify-between">
        <div className="text-medium mr-6">登录状态</div>
        {account?.loggedIn ? (
          <div className="flex items-center gap-3">
            <Chip color="success" variant="flat" size="sm">
              已登录
            </Chip>
            <span className="text-sm">{account.nickname || `UID ${account.uid}`}</span>
            <Button
              size="sm"
              variant="light"
              color="danger"
              startContent={<RiLogoutBoxRLine size={16} />}
              onPress={handleLogout}
            >
              退出
            </Button>
          </div>
        ) : (
          <Chip color="default" variant="flat" size="sm">
            未登录
          </Chip>
        )}
      </div>

      {!account?.loggedIn && (
        <>
          <div className="flex items-start justify-between gap-8">
            <div className="mr-6">
              <div className="text-medium">扫码登录</div>
              <div className="text-default-500 mt-0.5 text-xs">用网易云音乐 App 的「扫一扫」扫描下面的二维码</div>
            </div>

            <div className="flex w-[200px] flex-col items-center gap-2">
              {qrLoading || !qrSession ? (
                <Skeleton className="rounded-medium h-[180px] w-[180px]" />
              ) : (
                <div className="rounded-medium relative bg-white p-2">
                  <QRCodeCanvas value={qrSession.loginUrl} size={164} level="M" marginSize={0} />
                  {qrCheck && qrCheck.code !== 803 && (
                    <div className="absolute inset-x-0 -bottom-1 text-center text-[11px] text-black/60">
                      {QR_STATUS_TEXT[qrCheck.code] ?? ""}
                    </div>
                  )}
                </div>
              )}
              <Button
                size="sm"
                variant="light"
                className="text-xs"
                startContent={<RiRefreshLine size={14} />}
                onPress={() => void refreshQr()}
              >
                刷新二维码
              </Button>
            </div>
          </div>

          <div className="flex items-start justify-between gap-8">
            <div className="mr-6 shrink-0">
              <div className="text-medium">粘贴 Cookie</div>
              <div className="text-default-500 mt-0.5 text-xs">
                在浏览器登录 music.163.com 后，从开发者工具里复制整条 Cookie
              </div>
            </div>

            <div className="flex w-[420px] flex-col gap-2">
              <Textarea
                aria-label="网易云 Cookie"
                placeholder="MUSIC_U=…; __csrf=…"
                minRows={2}
                maxRows={4}
                value={cookieInput}
                onValueChange={setCookieInput}
                classNames={{ input: "text-xs" }}
              />
              <Button
                color="primary"
                size="sm"
                className="self-end"
                isLoading={isSubmitting}
                startContent={!isSubmitting ? <RiQrCodeLine size={16} /> : undefined}
                onPress={handleLoginWithCookie}
              >
                用 Cookie 登录
              </Button>
            </div>
          </div>
        </>
      )}

      <div className="text-default-500 text-xs">
        登录后即可使用网易云作为歌词来源；Cookie 会加密保存在本机，仅用于网易云接口。
      </div>
    </div>
  );
};

export default NeteaseSettings;
