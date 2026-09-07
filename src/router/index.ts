import { createRouter, createWebHistory } from "vue-router";
import { isGithubMode } from "../api/base";

/** 仅电脑端服务模式可用的页面（GitHub 直连模式访问时重定向到文章管理） */
const SERVER_ONLY_PATHS = new Set(["/publish", "/settings"]);

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: "/", redirect: "/dashboard" },
		{ path: "/dashboard", name: "dashboard", component: () => import("../views/Dashboard.vue"), meta: { title: "仪表盘" } },
		{ path: "/posts", name: "posts", component: () => import("../views/Posts.vue"), meta: { title: "文章管理" } },
		{ path: "/posts/edit", name: "post-edit", component: () => import("../views/PostEdit.vue"), meta: { title: "编辑文章" } },
		{ path: "/dynamics", name: "dynamics", component: () => import("../views/Dynamics.vue"), meta: { title: "动态管理" } },
		{ path: "/gallery", name: "gallery", component: () => import("../views/Gallery.vue"), meta: { title: "相册管理" } },
		{ path: "/gallery/open", name: "gallery-open", component: () => import("../views/GalleryView.vue"), meta: { title: "相册图片" } },
		{ path: "/wallpaper", name: "wallpaper", component: () => import("../views/Wallpaper.vue"), meta: { title: "主页图片" } },
		{ path: "/pages", name: "pages", component: () => import("../views/Pages.vue"), meta: { title: "页面管理" } },
		{ path: "/pages/edit", name: "page-edit", component: () => import("../views/PageEdit.vue"), meta: { title: "编辑页面" } },
		{ path: "/configs", name: "configs", component: () => import("../views/Configs.vue"), meta: { title: "站点配置" } },
		{ path: "/configs/edit", name: "config-edit", component: () => import("../views/ConfigEdit.vue"), meta: { title: "配置编辑" } },
		{ path: "/configs/raw", name: "config-raw", component: () => import("../views/ConfigRaw.vue"), meta: { title: "源码编辑" } },
		{ path: "/publish", name: "publish", component: () => import("../views/Publish.vue"), meta: { title: "发布" } },
		{ path: "/settings", name: "settings", component: () => import("../views/Settings.vue"), meta: { title: "项目管理" } },
		{ path: "/preferences", name: "preferences", component: () => import("../views/AppSettings.vue"), meta: { title: "应用设置" } },
		{ path: "/connect", name: "connect", component: () => import("../components/ServerConnect.vue"), meta: { title: "连接设置" } },
	],
});

// 直连模式下屏蔽仅电脑端可用的页面；/connect 在任何模式均可访问（用于切换连接方式 / PC 预览直连模式）
router.beforeEach((to) => {
	if (isGithubMode() && SERVER_ONLY_PATHS.has(to.path)) return "/posts";
});

export default router;
