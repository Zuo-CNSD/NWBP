import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { twMerge } from "tailwind-merge";

const isMac = window.electron?.getPlatform() === "macos";

interface LogoProps {
  isCollapsed: boolean;
}

/**
 * 侧栏顶部的品牌区。
 *
 * 只放「NWBP」这几个字，不放图标 —— 图标和文字并排会让标题区显得挤，
 * 而且折叠后图标才是唯一能看见的东西，现在改成文字就直接用缩写顶上。
 *
 * 这行字**同时是「回到主页」的入口**：主页不是菜单里的某一项，
 * 所以得有个一直看得见的地方能回去，标题是最自然的那个位置。
 */
const Logo = ({ isCollapsed }: LogoProps) => {
  const navigate = useNavigate();
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (!isMac) return;

    window.electron?.isFullScreen().then(setIsFullScreen);
    const unlisten = window.electron?.onWindowFullScreenChange(setIsFullScreen);

    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <div
      className={twMerge(
        "window-drag text-primary relative flex flex-none items-center py-3 pr-3 pl-4",
        isMac && !isFullScreen && "pt-8",
      )}
    >
      {/* 折叠后侧栏只有 72px（去掉左右内边距剩 44px），"NWBP" 放不下，所以用 "NW" */}
      <button
        type="button"
        title="回到主页"
        onClick={() => void navigate("/")}
        className={twMerge(
          "window-no-drag cursor-pointer leading-none font-bold tracking-tight transition-opacity hover:opacity-70",
          isCollapsed ? "text-xl" : "text-3xl",
        )}
      >
        {isCollapsed ? "NW" : "NWBP"}
      </button>
    </div>
  );
};

export default Logo;
