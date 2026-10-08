import { useEffect } from "react";

export const useStyle = () => {
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    const rootEl: HTMLDivElement | null = document.querySelector("#root");
    if (rootEl) {
      rootEl.style.background = "hsl(var(--heroui-background))";
      rootEl.style.overflow = "hidden";
      /*
       * 用同一个窗口圆角变量，别再拿「基准圆角」自己算 ——
       * 之前这里写的是 `borderRadius`px，比主窗口的窗口圆角小一档，
       * 两个窗口摆在一起能看出圆角不一致。
       */
      rootEl.style.borderRadius = "var(--window-radius, 16px)";
    }

    return () => {
      const rootEl: HTMLDivElement | null = document.querySelector("#root");
      if (rootEl) {
        document.documentElement.style.removeProperty("background");
        document.body.style.removeProperty("background");
        document.body.style.removeProperty("margin");
        document.body.style.removeProperty("overflow");
        rootEl.style.removeProperty("background");
        rootEl.style.removeProperty("overflow");
        rootEl.style.removeProperty("border-radius");
      }
    };
  }, []);
};
