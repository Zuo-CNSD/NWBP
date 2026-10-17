import { useEffect, useState } from "react";

import { Image as HeroImage, type ImageProps } from "@heroui/react";
import { RiFileImageLine } from "@remixicon/react";
import { twMerge } from "tailwind-merge";

import { formatUrlProtocol } from "@/common/utils/url";

interface Props extends ImageProps {
  params?: string;
  emptyPlaceholder?: React.ReactNode;
}

const Image = ({ params, width, height, src, className, emptyPlaceholder, ...rest }: Props) => {
  const [isError, setIsError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const formatSrc = formatUrlProtocol(src);
  const finalSrc =
    params && formatSrc && formatSrc.includes("/bfs/") && !formatSrc.includes("@")
      ? `${formatSrc}@${params}`
      : formatSrc;

  /*
   * 虚拟列表会**复用**同一批 DOM 节点，src 一换必须把「已加载」状态清掉 ——
   * 否则新图会顶着上一张的 opacity-100 直接露出来，既没有底色也没有淡入。
   */
  useEffect(() => {
    setIsLoaded(false);
    setIsError(false);
  }, [finalSrc]);

  if (!src || isError) {
    return (
      <div
        className={twMerge("border-content2 rounded-medium flex h-full items-center justify-center border", className)}
        style={{ width, height }}
      >
        {emptyPlaceholder || <RiFileImageLine size="40%" className="text-default-500" />}
      </div>
    );
  }

  return (
    <HeroImage
      width={width}
      height={height}
      src={finalSrc}
      // 未加载完先露出 content2 底色，避免「白块突然变成封面」的闪跳
      loading="lazy"
      onLoad={() => {
        setIsLoaded(true);
      }}
      onError={() => {
        setIsError(true);
      }}
      className={twMerge(
        "bg-content2 object-cover transition-opacity duration-200",
        isLoaded ? "opacity-100" : "opacity-0",
        className,
      )}
      {...rest}
    />
  );
};

export default Image;
