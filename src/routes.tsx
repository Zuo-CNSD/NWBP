import type { RouteObject } from "react-router";

import Layout from "./layout";
import DesktopLyrics from "./pages/desktop-lyrics";
import DownloadList from "./pages/download-list";
import DynamicFeed from "./pages/dynamic-feed";
import EmptyPage from "./pages/empty";
import FollowList from "./pages/follow-list";
import History from "./pages/history";
import Home from "./pages/home";
import Later from "./pages/later";
import LocalMusicPage from "./pages/local-music";
import MiniPlayer from "./pages/mini-player";
import MusicRecommend from "./pages/music-recommend";
import NotFound from "./pages/not-found";
import Search from "./pages/search";
import Settings from "./pages/settings";
import UserProfile from "./pages/user-profile";
import Folder from "./pages/video-collection";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        // 默认进主页；推荐音乐挪到 /recommend
        index: true,
        element: <Home />,
      },
      {
        path: "recommend",
        element: <MusicRecommend />,
      },
      {
        path: "later",
        element: <Later />,
      },
      {
        path: "history",
        element: <History />,
      },
      {
        path: "follow",
        element: <FollowList />,
      },
      {
        path: "collection/:id",
        element: <Folder />,
      },
      {
        path: "user/:id",
        element: <UserProfile />,
      },
      {
        path: "settings",
        element: <Settings />,
      },
      {
        path: "download-list",
        element: <DownloadList />,
      },
      {
        path: "dynamic-feed",
        element: <DynamicFeed />,
      },
      {
        path: "local-music",
        element: <LocalMusicPage />,
      },
      {
        path: "search",
        element: <Search />,
      },
      {
        path: "empty",
        element: <EmptyPage />,
      },
    ],
  },
  {
    path: "mini-player",
    element: <MiniPlayer />,
  },
  {
    // 桌面歌词是一个独立的置顶窗口，和迷你播放器一样走单独路由
    path: "desktop-lyrics",
    element: <DesktopLyrics />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
