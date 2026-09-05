import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: "/", redirect: "/dashboard" },
		{ path: "/dashboard", name: "dashboard", component: () => import("../views/Dashboard.vue"), meta: { title: "仪表盘" } },
		{ path: "/posts", name: "posts", component: () => import("../views/Posts.vue"), meta: { title: "文章管理" } },
		{ path: "/posts/edit", name: "post-edit", component: () => import("../views/PostEdit.vue"), meta: { title: "编辑文章" } },
		{ path: "/dynamics", name: "dynamics", component: () => import("../views/Dynamics.vue"), meta: { title: "动态管理" } },
		{ path: "/gallery", name: "gallery", component: () => import("../views/Gallery.vue"), meta: { title: "相册管理" } },
		{ path: "/wallpaper", name: "wallpaper", component: () => import("../views/Wallpaper.vue"), meta: { title: "主页图片" } },
		{ path: "/pages", name: "pages", component: () => import("../views/Pages.vue"), meta: { title: "页面管理" } },
		{ path: "/configs", name: "configs", component: () => import("../views/Configs.vue"), meta: { title: "站点配置" } },
		{ path: "/publish", name: "publish", component: () => import("../views/Publish.vue"), meta: { title: "发布" } },
		{ path: "/settings", name: "settings", component: () => import("../views/Settings.vue"), meta: { title: "项目管理" } },
	],
});

export default router;
