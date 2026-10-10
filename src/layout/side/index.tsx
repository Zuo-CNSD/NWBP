import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { Button, useDisclosure } from "@heroui/react";
import { RiArrowLeftDoubleLine, RiArrowRightDoubleLine } from "@remixicon/react";
import clx from "classnames";

import FavoritesEditModal from "@/components/favorites-edit-modal";
import ScrollContainer from "@/components/scroll-container";
import { useSettings } from "@/store/settings";

import Collection from "./collection";
import DefaultMenus from "./default-menu";
import Logo from "./logo";
import NeteaseMenus from "./netease-menu";

const COLLAPSED_WIDTH = 72;
const MIN_WIDTH = 160;
const MAX_WIDTH = 480;

const SideNav = () => {
  const sideMenuCollapsed = useSettings(state => state.sideMenuCollapsed);
  const sideMenuWidth = useSettings(state => state.sideMenuWidth);
  const updateSettings = useSettings(state => state.update);

  const {
    isOpen: isFavoritesEditModalOpen,
    onOpen: onOpenFavoritesEditModal,
    onOpenChange: onOpenChangeFavoritesEditModal,
  } = useDisclosure();
  const [editingFavoriteId, setEditingFavoriteId] = useState<number>();

  const handleOpenAddFavorite = () => {
    setEditingFavoriteId(undefined);
    onOpenFavoritesEditModal();
  };

  const handleOpenEditFavorite = (id: number) => {
    setEditingFavoriteId(id);
    onOpenFavoritesEditModal();
  };

  const handleFavoritesEditModalChange = (isOpen: boolean) => {
    if (!isOpen) {
      setEditingFavoriteId(undefined);
    }

    onOpenChangeFavoritesEditModal();
  };

  const sidebarWidth = (() => {
    if (sideMenuCollapsed) return COLLAPSED_WIDTH;
    const width = sideMenuWidth ?? 200;
    if (width < MIN_WIDTH) return MIN_WIDTH;
    if (width > MAX_WIDTH) return MAX_WIDTH;
    return width;
  })();

  const [renderWidth, setRenderWidth] = useState(sidebarWidth);
  const [isDragging, setIsDragging] = useState(false);
  const isCollapsedVisual = isDragging ? renderWidth < MIN_WIDTH : sideMenuCollapsed;

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(sidebarWidth);
  const prevUserSelectRef = useRef<string | null>(null);

  useEffect(() => {
    startWidthRef.current = sidebarWidth;
    if (!isDragging) {
      setRenderWidth(sidebarWidth);
    }
  }, [isDragging, sidebarWidth]);

  const onToggleCollapsed = () => {
    updateSettings({ sideMenuCollapsed: !sideMenuCollapsed });
  };

  const onStartResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    startXRef.current = event.clientX;
    startWidthRef.current = sidebarWidth;
    prevUserSelectRef.current = document.body.style.userSelect;
    document.body.style.userSelect = "none";
  };

  const computeWidth = (delta: number) => {
    const rawWidth = Math.max(COLLAPSED_WIDTH, startWidthRef.current + delta);
    const cappedWidth = Math.min(rawWidth, MAX_WIDTH);
    const willCollapse = cappedWidth < MIN_WIDTH;
    const widthForView = willCollapse ? COLLAPSED_WIDTH : Math.max(MIN_WIDTH, cappedWidth);
    const widthToPersist = Math.max(MIN_WIDTH, cappedWidth);

    return { willCollapse, widthForView, widthToPersist };
  };

  useEffect(() => {
    // re-clamp render width if max width shrinks while not dragging
    if (!isDragging) {
      setRenderWidth(prev => Math.min(Math.max(prev, COLLAPSED_WIDTH), MAX_WIDTH));
    }
  }, [isDragging]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const delta = event.clientX - startXRef.current;
      const { widthForView } = computeWidth(delta);

      setRenderWidth(widthForView);
    };

    const onMouseUp = (event: MouseEvent) => {
      if (!isDraggingRef.current) return;

      isDraggingRef.current = false;
      setIsDragging(false);
      if (prevUserSelectRef.current !== null) {
        document.body.style.userSelect = prevUserSelectRef.current;
      }

      const delta = event.clientX - startXRef.current;
      const { willCollapse, widthForView, widthToPersist } = computeWidth(delta);

      setRenderWidth(widthForView);
      updateSettings({ sideMenuCollapsed: willCollapse, sideMenuWidth: widthToPersist });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (isDraggingRef.current && prevUserSelectRef.current !== null) {
        document.body.style.userSelect = prevUserSelectRef.current;
      }
    };
  }, [updateSettings]);

  return (
    <>
      <div
        className={clx(
          // 侧栏不再是自己一块浮起面板：它现在是外层大面板的左侧一栏，
          // 所以不带圆角/边距，只靠右侧分隔线和内容区分开
          "border-divider/20 relative flex h-full flex-none flex-col border-r-1",
          {
            "transition-[width] duration-200": !isDragging,
            "transition-none": isDragging,
          },
        )}
        style={{ width: `${renderWidth}px` }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <Logo isCollapsed={isCollapsedVisual} />
          <ScrollContainer
            className={clx("min-h-0 flex-1 pb-2", {
              "px-4": !isCollapsedVisual,
              "overflow-hidden": isDragging,
            })}
          >
            <DefaultMenus isCollapsed={isCollapsedVisual} onOpenAddFavorite={handleOpenAddFavorite} />
            <Collection
              isCollapsed={isCollapsedVisual}
              onOpenAddFavorite={handleOpenAddFavorite}
              onOpenEditFavorite={handleOpenEditFavorite}
            />
            {/*
              网易云分组放在最后：前面的「哔哩哔哩 + 收藏夹」是一整块，
              插在中间会把 B 站那组切开。两组并存，不随搜索页的音源开关变化。
            */}
            <NeteaseMenus isCollapsed={isCollapsedVisual} />
          </ScrollContainer>
          <div className="flex flex-none justify-center px-2 pb-2">
            <Button
              size="sm"
              isIconOnly
              radius="md"
              onPress={onToggleCollapsed}
              aria-label={isCollapsedVisual ? "展开侧边栏" : "收起侧边栏"}
              className="bg-default/40 hover:bg-primary/20 hover:text-primary h-7 w-full min-w-0 transition-colors"
            >
              {isCollapsedVisual ? <RiArrowRightDoubleLine size={16} /> : <RiArrowLeftDoubleLine size={16} />}
            </Button>
          </div>
        </div>
        <div
          className="group absolute top-0 right-0 z-20 h-full w-2 cursor-col-resize bg-transparent"
          onMouseDown={onStartResize}
        >
          {/* 胶囊形的拖拽提示条 */}
          <div className="bg-primary/60 pointer-events-none absolute top-1/2 left-1/2 h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        </div>
      </div>
      <FavoritesEditModal
        mid={editingFavoriteId}
        isOpen={isFavoritesEditModalOpen}
        onOpenChange={handleFavoritesEditModalChange}
      />
    </>
  );
};

export default SideNav;
