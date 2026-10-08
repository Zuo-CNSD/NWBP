import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

/**
 * 切换路由时的一层极短遮蔽 + 顶部扫过的一条主色线。
 *
 * ⚠️ 为什么是「盖一层」而不是「包住 Outlet」：
 * 之前那版页面切换动画（`pageTransition` 设置，UI 已撤掉）是**包住 Outlet** 做过渡的，
 * 结果每切一次页面整棵子树都会重挂载 —— 重复渲染 + 数据请求 double，所以被移除了。
 * 这一版只往 DOM 里插一个绝对定位的**兄弟节点**，不碰 Outlet：
 * 页面组件不重新挂载，只是被短暂盖住，数据请求不会翻倍。
 *
 * 挂载点是 `Layout` 里的 `.glass-content`（它本来就是 `position: relative; z-index: 1`），
 * 所以定位不需要改动任何现有布局，也不会成为页面内 absolute 元素的新包含块。
 */
const PageTransition = () => {
  const { pathname } = useLocation();
  // 0 表示还没切过页。首次进入 app 不播 —— 那时候有开场动画，再来一下就是重复。
  const [tick, setTick] = useState(0);
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setTick(t => t + 1);
  }, [pathname]);

  // 动画跑完就把节点摘掉，不留一个永远透明的合成层
  useEffect(() => {
    if (tick === 0) return;
    const timer = setTimeout(() => setTick(0), 400);
    return () => clearTimeout(timer);
  }, [tick]);

  if (tick === 0) return null;

  return (
    // key 一换，动画就从第一帧重播
    <div key={tick} aria-hidden className="page-switch">
      <span className="page-switch-line" />
    </div>
  );
};

export default PageTransition;
