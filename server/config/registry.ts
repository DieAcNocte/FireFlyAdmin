/**
 * 配置注册表：声明"哪些配置文件的哪些字段"暴露为可视化表单。
 *
 * 扩展方式：在这里加一个 ConfigEntry（或往 fields 里加一条 FieldSpec），
 * 前端会按元信息自动渲染表单，无需改动页面代码。
 */

export type FieldType =
	| "string"
	| "text"
	| "number"
	| "boolean"
	| "select"
	| "stringArray"
	/** 桌面壁纸图片数组：前端渲染为图片选择器 */
	| "wallpaperDesktop"
	/** 移动壁纸图片数组：前端渲染为图片选择器 */
	| "wallpaperMobile"
	/** 对象数组：按 itemFields 渲染行编辑 */
	| "arrayOfObjects";

export interface ItemFieldSpec {
	key: string;
	label: string;
	type: "string" | "text" | "number" | "boolean" | "stringArray";
	/** 可选字段：值为空字符串/空数组时不写入配置（保持原文件不出现该键） */
	optional?: boolean;
	placeholder?: string;
}

export interface FieldSpec {
	/** 相对导出常量的点路径，如 "src.desktop"、"themeColor.hue" */
	path: string;
	label: string;
	type: FieldType;
	options?: string[];
	itemFields?: ItemFieldSpec[];
	tip?: string;
}

export interface ConfigEntry {
	/** src/config/ 下的文件名 */
	file: string;
	/** 文件内导出的常量名 */
	exportName: string;
	title: string;
	description?: string;
	fields: FieldSpec[];
}

export const configRegistry: ConfigEntry[] = [
	{
		file: "siteConfig.ts",
		exportName: "siteConfig",
		title: "站点基础",
		description: "站点标题、描述、主题色等基础信息",
		fields: [
			{ path: "title", label: "站点标题", type: "string" },
			{ path: "subtitle", label: "站点副标题", type: "string" },
			{ path: "site_url", label: "站点 URL", type: "string", tip: "例如 https://example.com，结尾不带 /" },
			{ path: "description", label: "站点描述", type: "text", tip: "用于 SEO 与分享摘要" },
			{ path: "keywords", label: "站点关键词", type: "stringArray" },
			{ path: "themeColor.hue", label: "主题色相", type: "number", tip: "0-360，例如 25 为宵宫烟花橙" },
			{ path: "themeColor.defaultMode", label: "默认配色模式", type: "select", options: ["light", "dark", "system"] },
			{ path: "pageWidth", label: "页面宽度 (rem)", type: "number" },
			{ path: "pagination.postsPerPage", label: "每页文章数", type: "number" },
			{ path: "categoryStyle", label: "分类样式", type: "select", options: ["pill", "rectangle"] },
			{ path: "tagStyle", label: "标签样式", type: "select", options: ["pill", "pill-gray", "rectangle"] },
			{ path: "timezone", label: "时区", type: "string", tip: "例如 Asia/Shanghai，影响动态发布时间戳" },
		],
	},
	{
		file: "profileConfig.ts",
		exportName: "profileConfig",
		title: "个人资料",
		description: "侧边栏头像、昵称、签名与社交链接",
		fields: [
			{ path: "avatar", label: "头像路径", type: "string", tip: "src 目录不带 / 开头（推荐），public 目录带 / 开头，或远程 URL" },
			{ path: "name", label: "昵称", type: "string" },
			{ path: "bio", label: "个人签名", type: "text" },
			{
				path: "links",
				label: "社交链接",
				type: "arrayOfObjects",
				tip: "图标为 Iconify 代码，如 fa7-brands:github",
				itemFields: [
					{ key: "name", label: "名称", type: "string" },
					{ key: "icon", label: "图标", type: "string", placeholder: "fa7-brands:github" },
					{ key: "url", label: "链接", type: "string" },
					{ key: "showName", label: "显示名称", type: "boolean", optional: true },
				],
			},
		],
	},
	{
		file: "galleryConfig.ts",
		exportName: "galleryConfig",
		title: "相册",
		description: "相册列表与瀑布流列宽（图片在「相册」页面管理）",
		fields: [
			{
				path: "albums",
				label: "相册列表",
				type: "arrayOfObjects",
				tip: "id 对应 public/gallery/<id>/ 图片目录；图片请在「相册」页面上传",
				itemFields: [
					{ key: "id", label: "ID", type: "string", placeholder: "my-album" },
					{ key: "name", label: "名称", type: "string" },
					{ key: "description", label: "描述", type: "text" },
					{ key: "location", label: "地点", type: "string" },
					{ key: "date", label: "日期", type: "string", placeholder: "YYYY-MM-DD" },
					{ key: "tags", label: "标签", type: "stringArray" },
					{ key: "password", label: "访问密码", type: "string", optional: true },
					{ key: "passwordHint", label: "密码提示", type: "string", optional: true },
				],
			},
			{ path: "columnWidth", label: "瀑布流最小列宽 (px)", type: "number" },
		],
	},
	{
		file: "backgroundWallpaper.ts",
		exportName: "backgroundWallpaper",
		title: "主页壁纸",
		description: "壁纸模式、桌面/移动壁纸图与主页横幅文字（图片在「主页图片」页面管理）",
		fields: [
			{ path: "mode", label: "壁纸模式", type: "select", options: ["banner", "fullscreen", "overlay", "none"] },
			{ path: "src.desktop", label: "桌面壁纸", type: "wallpaperDesktop", tip: "数组时每次刷新随机显示一张" },
			{ path: "src.mobile", label: "移动壁纸", type: "wallpaperMobile", tip: "数组时每次刷新随机显示一张" },
			{ path: "common.homeText.enable", label: "启用主页横幅文字", type: "boolean" },
			{ path: "common.homeText.title", label: "横幅主标题", type: "string" },
			{ path: "common.homeText.subtitle", label: "横幅副标题", type: "stringArray", tip: "打字机开启时循环显示" },
			{ path: "common.homeText.linksEnable", label: "显示标题下链接图标", type: "boolean" },
			{
				path: "common.homeText.links",
				label: "横幅链接",
				type: "arrayOfObjects",
				tip: "图标为 Iconify 代码，如 fa7-brands:github",
				itemFields: [
					{ key: "name", label: "名称", type: "string" },
					{ key: "icon", label: "图标", type: "string", placeholder: "fa7-brands:github" },
					{ key: "url", label: "链接", type: "string" },
					{ key: "showName", label: "显示名称", type: "boolean", optional: true },
				],
			},
		],
	},
];
