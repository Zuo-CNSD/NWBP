import React from "react";
import { Controller, type Control } from "react-hook-form";

import { Input, Select, SelectItem } from "@heroui/react";

import { t } from "@/common/i18n";

interface ProxySettingsProps {
  control: Control<AppSettings>;
}

const getProxyTypeOptions = (): { key: ProxyType; label: string }[] => [
  { key: "none", label: t("不使用代理") },
  { key: "http", label: t("HTTP 代理") },
  { key: "socks4", label: t("SOCKS4 代理") },
  { key: "socks5", label: t("SOCKS5 代理") },
];

/**
 * 代理设置。
 *
 * Beta 9 起不再是一个独立的设置 Tab，而是嵌在「常规设置 → 网络」的折叠区里，
 * 所以**外面不能再用 `<Form>`** —— 那样会嵌进「常规设置」的 Form 里，
 * 变成非法的 form 套 form。Controller 靠显式传入的 control 工作，不需要 Form 上下文。
 */
const ProxySettings: React.FC<ProxySettingsProps> = ({ control }) => {
  return (
    <div className="space-y-6">
      <Controller
        control={control}
        name="proxySettings"
        render={({ field }) => {
          const value = field.value ?? {
            type: "none" as ProxyType,
            host: "",
            port: undefined,
            username: "",
            password: "",
          };

          const setProxy = (patch: Partial<ProxySettings>) => {
            field.onChange({
              ...value,
              ...patch,
            });
          };

          const showPassword = value.type === "http" || value.type === "socks5";

          return (
            <div className="space-y-4">
              <div className="w-[240px]">
                <Select
                  disallowEmptySelection
                  aria-label={t("代理类型")}
                  selectedKeys={new Set([value.type])}
                  onSelectionChange={keys => {
                    const next = Array.from(keys)[0] as ProxyType | undefined;
                    setProxy({
                      type: next ?? "none",
                    });
                  }}
                >
                  {getProxyTypeOptions().map(option => (
                    <SelectItem key={option.key}>{option.label}</SelectItem>
                  ))}
                </Select>
              </div>

              {(value.type === "http" || value.type === "socks4" || value.type === "socks5") && (
                <>
                  <div className="space-y-1">
                    <div className="text-default-500 grid grid-cols-2 gap-4 text-sm">
                      <span>{t("主机")}</span>
                      <span>{t("端口")}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        placeholder={t("主机")}
                        value={value.host ?? ""}
                        onValueChange={v => setProxy({ host: v })}
                      />
                      <Input
                        placeholder={t("端口")}
                        inputMode="numeric"
                        value={value.port ? String(value.port) : ""}
                        onValueChange={v => {
                          const trimmed = v.trim();
                          const num = Number(trimmed);
                          setProxy({ port: Number.isFinite(num) && num > 0 ? num : undefined });
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-default-500 grid grid-cols-2 gap-4 text-sm">
                      <span>{t("用户名")}</span>
                      {showPassword && <span>{t("密码")}</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        placeholder={t("用户名")}
                        value={value.username ?? ""}
                        onValueChange={v => setProxy({ username: v })}
                      />
                      {showPassword && (
                        <Input
                          placeholder={t("密码")}
                          type="password"
                          value={value.password ?? ""}
                          onValueChange={v => setProxy({ password: v })}
                        />
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        }}
      />
    </div>
  );
};

export default ProxySettings;
