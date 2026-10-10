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
import NeteaseAlbumDetail from "./pages/netease/album-detail";
import NeteaseAlbums from "./pages/netease/albums";
import NeteaseHot from "./pages/netease/hot";
import NeteaseLiked from "./pages/netease/liked";
import NeteasePlaylistDetail from "./pages/netease/playlist-detail";
import NeteasePlaylists from "./pages/netease/playlists";
import NotFound from "./pages/not-found";
import PlayHistory from "./pages/play-history";
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
        // 本地播放历史（主页「最近播放」的全部）；和上面 `/history`（B 站站内观看历史）是两码事
        path: "play-history",
        element: <PlayHistory />,
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
      /* ---- 网易云 ---- */
      {
        path: "netease/liked",
        element: <NeteaseLiked />,
      },
      {
        path: "netease/playlists",
        element: <NeteasePlaylists />,
      },
      {
        path: "netease/albums",
        element: <NeteaseAlbums />,
      },
      {
        path: "netease/hot",
        element: <NeteaseHot />,
      },
      {
        path: "netease/playlist/:id",
        element: <NeteasePlaylistDetail />,
      },
      {
        path: "netease/album/:id",
        element: <NeteaseAlbumDetail />,
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
