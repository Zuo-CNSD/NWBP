/**
 * 主进程抛回来的错误会被 Electron 包一层前缀
 * （`Error invoking remote method 'xxx': Error: 真正的信息`），这里剥掉它，
 * 否则界面/toast 里会是一长串没有意义的技术前缀。
 */
export const cleanErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return (
    raw
      .replace(/^Error invoking remote method '[^']*':\s*/, "")
      .replace(/^Error:\s*/, "")
      .trim() || "操作失败"
  );
};

/**
 * 列表取数失败的展示文案。
 *
 * 主进程的「未登录：请先在设置中登录网易云账号」是**有效信息**，要照原样给用户看；
 * 剩下的（网络断了、代理挂了、接口报错）统一成一句人话，
 * 别把 `TypeError: Failed to fetch` 这种摊到界面上。
 */
export const describeLoadError = (error: unknown) => {
  const message = cleanErrorMessage(error);
  return message.includes("登录") ? message : "加载失败，检查一下网络或代理";
};
