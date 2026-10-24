import { useMemo } from "react";

import { addToast, Button, Chip, Switch } from "@heroui/react";
import { RiDownloadLine, RiExternalLinkLine, RiRefreshLine, RiShieldCheckLine } from "@remixicon/react";

import { t } from "@/common/i18n";
import { formatAppVersion } from "@/common/utils/version";
import { useUpdateStore } from "@/store/update";

/**
 * 关于与更新。
 *
 * 这个页面只做三件事：说明当前是什么版本、查一次有没有新版、把公告摆出来。
 * 「自动更新」在这里是**检查 + 提示 + 给下载入口**，不是静默替换程序文件 ——
 * macOS 那份包没有签名/公证，静默替换的下一步就是 Gatekeeper 拦下，
 * 与其做个半吊子的自动安装，不如把来源和校验讲清楚。
 */

const formatDate = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
};

const openLink = async (url?: string) => {
  if (!url) return;
  const ok = await window.electron.openUpdateDownload(url);
  if (!ok) addToast({ title: t("这个链接打不开，地址可能已经失效"), color: "warning" });
};

const AnnouncementList = () => {
  const result = useUpdateStore(s => s.result);
  const read = useUpdateStore(s => s.readAnnouncements);
  const markRead = useUpdateStore(s => s.markAnnouncementsRead);

  const list = result?.announcements ?? [];
  if (!list.length) return null;

  return (
    <div className="space-y-2">
      <div className="text-default-500 text-sm">{t("公告")}</div>
      {list.map(item => {
        const isUnread = !read.includes(item.id);
        return (
          <div
            key={item.id}
            className="bg-content2 rounded-medium space-y-1 px-3 py-2.5"
            style={item.level === "warning" ? { borderLeft: "3px solid var(--heroui-warning)" } : undefined}
          >
            <div className="flex items-center gap-2">
              {isUnread && <span className="bg-primary h-1.5 w-1.5 flex-none rounded-full" />}
              <span className="text-sm font-medium">{item.title}</span>
              {item.date && <span className="text-default-400 text-xs">{formatDate(item.date)}</span>}
              <div className="ml-auto flex items-center gap-1">
                {item.link && (
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    onPress={() => void openLink(item.link)}
                    aria-label={t("打开链接")}
                  >
                    <RiExternalLinkLine size={14} />
                  </Button>
                )}
                {isUnread && (
                  <Button size="sm" variant="light" onPress={() => markRead([item.id])}>
                    {t("知道了")}
                  </Button>
                )}
              </div>
            </div>
            {item.body && <p className="text-default-500 text-xs leading-relaxed">{item.body}</p>}
          </div>
        );
      })}
    </div>
  );
};

const UpdateSettings = ({ appVersion }: { appVersion: string }) => {
  const result = useUpdateStore(s => s.result);
  const checking = useUpdateStore(s => s.checking);
  const autoCheck = useUpdateStore(s => s.autoCheck);
  const check = useUpdateStore(s => s.check);
  const setAutoCheck = useUpdateStore(s => s.setAutoCheck);

  const current = useMemo(() => formatAppVersion(appVersion), [appVersion]);
  const release = result?.release;
  const hasUpdate = Boolean(result?.ok && result.hasUpdate && release);
  const notes = release?.notes ?? [];
  const knownIssues = release?.knownIssues ?? [];

  const runCheck = async () => {
    try {
      const next = await check(true);
      if (!next) return;
      if (!next.ok) {
        addToast({ title: t("检查失败，稍后再试或者去 Releases 看看"), color: "warning" });
        return;
      }
      addToast({
        title: next.hasUpdate
          ? t("发现新版本 {0}", formatAppVersion(next.release?.version ?? ""))
          : t("已经是最新版本"),
      });
    } catch {
      addToast({ title: t("检查失败，稍后再试或者去 Releases 看看"), color: "warning" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-1">
          <div className="text-medium font-medium">{t("关于与更新")}</div>
          <div className="text-default-500 text-sm">
            {t("当前版本 {0}", current)}
            {result?.source && (
              <span className="text-default-400">
                {" · "}
                {t("数据来自 {0}", result.source)}
              </span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          color="primary"
          variant="flat"
          isLoading={checking}
          startContent={!checking && <RiRefreshLine size={14} />}
          onPress={() => void runCheck()}
        >
          {t("检查更新")}
        </Button>
      </div>

      {hasUpdate && release && (
        <div className="bg-content2 rounded-medium space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-medium">{formatAppVersion(release.version)}</span>
            {release.name && <span className="text-default-400 text-xs">{release.name}</span>}
            <Chip size="sm" color="primary" variant="flat">
              {t("有新版本")}
            </Chip>
            {release.publishedAt && <span className="text-default-400 text-xs">{formatDate(release.publishedAt)}</span>}
          </div>

          {notes.length > 0 && (
            <ul className="space-y-1">
              {notes.map(line => (
                <li key={line} className="text-default-600 flex gap-2 text-sm leading-relaxed">
                  <span className="text-primary flex-none">·</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}

          {knownIssues.length > 0 && (
            <div className="space-y-1">
              <div className="text-warning-600 text-xs font-medium">{t("已知问题")}</div>
              <ul className="space-y-1">
                {knownIssues.map(line => (
                  <li key={line} className="text-default-500 flex gap-2 text-xs leading-relaxed">
                    <span className="flex-none">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              color="primary"
              startContent={<RiDownloadLine size={14} />}
              onPress={() => void openLink(release.downloads?.mirror ?? release.downloads?.github)}
            >
              {release.downloads?.mirror ? t("国内渠道下载") : t("前往下载")}
            </Button>
            {release.downloads?.mirror && release.downloads?.github && (
              <Button
                size="sm"
                variant="flat"
                startContent={<RiExternalLinkLine size={14} />}
                onPress={() => void openLink(release.downloads?.github)}
              >
                {t("GitHub Releases")}
              </Button>
            )}
          </div>

          <p className="text-default-400 flex items-start gap-1.5 text-[11px] leading-relaxed">
            <RiShieldCheckLine size={13} className="mt-0.5 flex-none" />
            {t("下载地址来自本项目的发布清单，安装包请以官网或仓库为准；下载后可用 Release 里的 SHA-256 自行核对。")}
          </p>
        </div>
      )}

      {result?.ok && !hasUpdate && (
        <div className="rounded-medium border-success/30 bg-success/5 border px-3 py-2.5 text-sm">
          {t("已经是最新版本")}
          {result.release?.version && (
            <span className="text-default-400 text-xs">
              {" · "}
              {t("远端版本 {0}", formatAppVersion(result.release.version))}
            </span>
          )}
        </div>
      )}

      {result && !result.ok && (
        <div className="rounded-medium border-warning/30 bg-warning/5 border px-3 py-2.5 text-sm">
          {t("检查失败：{0}", result.error ?? t("网络请求失败"))}
          <div className="text-default-400 mt-1 text-xs">{t("可以到 GitHub Releases 手动查看最新版本。")}</div>
        </div>
      )}

      <AnnouncementList />

      <div className="flex items-center justify-between gap-6">
        <div className="space-y-0.5">
          <div className="text-medium">{t("启动时自动检查更新")}</div>
          <div className="text-default-500 text-xs">
            {t("只做检测和提示，不会自动替换程序文件；关掉后仍可在这里手动检查。")}
          </div>
        </div>
        <Switch isSelected={autoCheck} onValueChange={setAutoCheck} aria-label={t("启动时自动检查更新")} />
      </div>

      <p className="text-default-400 text-xs leading-relaxed">
        {t("检查更新只会访问本项目仓库的发布清单，不会上传任何本地信息。")}
      </p>
    </div>
  );
};

export default UpdateSettings;
