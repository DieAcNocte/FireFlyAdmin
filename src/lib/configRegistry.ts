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

/**
 * Mizuki 主题的配置注册表（字段以 LyraVoid/Mizuki v9 为准，与 FireFly 分歧较大）：
 * - siteConfig 字段名不同（siteURL/timeZone），description/keywords/pagination 等字段不存在
 * - 壁纸拆为 siteConfig.wallpaperMode + siteConfig.banner + backgroundWallpaper.ts 的 fullscreenWallpaperConfig
 * - profileConfig 与 FireFly 同构（Fuwari 血统），声明复用
 */
export const mizukiConfigRegistry: ConfigEntry[] = [
	{
		file: "siteConfig.ts",
		exportName: "siteConfig",
		title: "站点基础",
		description: "站点标题、URL、时区与主题色等基础信息",
		fields: [
			{ path: "title", label: "站点标题", type: "string" },
			{ path: "subtitle", label: "站点副标题", type: "string" },
			{ path: "siteURL", label: "站点 URL", type: "string", tip: "以 / 结尾，例如 https://example.com/" },
			{ path: "siteStartDate", label: "建站日期", type: "string", tip: "格式 YYYY-MM-DD，用于运行天数统计" },
			{ path: "timeZone", label: "时区", type: "string", tip: "IANA 时区，如 Asia/Shanghai" },
			{ path: "themeColor.hue", label: "主题色相", type: "number", tip: "0-360，例如 240 为默认蓝紫" },
			{ path: "themeColor.fixed", label: "固定主题色", type: "boolean", tip: "开启后对访问者隐藏主题色选择器" },
			{ path: "tagStyle.useNewStyle", label: "标签新样式", type: "boolean", tip: "悬停高亮样式（新）或外框常亮样式（旧）" },
			{ path: "wallpaperMode.defaultMode", label: "壁纸模式", type: "select", options: ["banner", "fullscreen", "none"] },
			{ path: "banner.src.desktop", label: "横幅桌面图", type: "wallpaperDesktop", tip: "在「主页图片」页面管理，数组时轮播" },
			{ path: "banner.src.mobile", label: "横幅移动图", type: "wallpaperMobile", tip: "在「主页图片」页面管理" },
			{ path: "banner.homeText.enable", label: "启用主页横幅文字", type: "boolean" },
			{ path: "banner.homeText.title", label: "横幅主标题", type: "string" },
			{ path: "banner.homeText.subtitle", label: "横幅副标题", type: "stringArray", tip: "打字机开启时循环显示" },
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
		file: "backgroundWallpaper.ts",
		exportName: "fullscreenWallpaperConfig",
		title: "全屏壁纸",
		description: "全屏壁纸开关、桌面/移动壁纸图与显示效果（图片在「主页图片」页面管理）",
		fields: [
			{ path: "enable", label: "启用全屏壁纸", type: "boolean" },
			{ path: "src.desktop", label: "桌面壁纸", type: "wallpaperDesktop", tip: "数组时轮播显示" },
			{ path: "src.mobile", label: "移动壁纸", type: "wallpaperMobile" },
			{ path: "position", label: "壁纸定位", type: "select", options: ["top", "center", "bottom"] },
			{ path: "carousel.enable", label: "启用轮播", type: "boolean" },
			{ path: "carousel.interval", label: "轮播间隔 (秒)", type: "number" },
			{ path: "opacity", label: "壁纸不透明度", type: "number", tip: "0-1" },
			{ path: "blur", label: "背景模糊半径 (px)", type: "number" },
		],
	},
];

/**
 * Fuwari 原型主题注册表（src/config.ts 单文件）：
 * 无相册/日记/壁纸模块，仅暴露站点基础与个人资料；横幅是 siteConfig.banner（单字符串 src）。
 */
export const fuwariRegistry: ConfigEntry[] = [
	{
		file: "config.ts",
		exportName: "siteConfig",
		title: "站点基础",
		description: "站点标题、主题色与横幅（Fuwari 原型主题）",
		fields: [
			{ path: "title", label: "站点标题", type: "string" },
			{ path: "subtitle", label: "站点副标题", type: "string" },
			{ path: "lang", label: "站点语言", type: "string", tip: "如 en / zh_CN / ja" },
			{ path: "themeColor.hue", label: "主题色相", type: "number", tip: "0-360，例如 250 为默认蓝紫" },
			{ path: "themeColor.fixed", label: "固定主题色", type: "boolean", tip: "开启后对访问者隐藏主题色选择器" },
			{ path: "banner.enable", label: "启用横幅图", type: "boolean" },
			{ path: "banner.src", label: "横幅图片路径", type: "string", tip: "src 目录相对路径不带 / 开头；public 目录带 / 开头" },
			{ path: "banner.position", label: "横幅定位", type: "select", options: ["top", "center", "bottom"] },
			{ path: "toc.enable", label: "启用文章目录", type: "boolean" },
			{ path: "toc.depth", label: "目录深度", type: "number", tip: "1-3，表示展示到几级标题" },
		],
	},
	{
		file: "config.ts",
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
];

/** 按主题与配置布局取用注册表（Mizuki v8.x 与 Fuwari 为 src/config.ts 单文件，v9+ 为 src/config/ 目录） */
export function getConfigRegistry(
	theme: "firefly" | "mizuki" | "fuwari" | "unknown",
	configLayout: "dir" | "single" | null = "dir"
): ConfigEntry[] {
	if (theme === "mizuki") return configLayout === "single" ? mizukiSingleRegistry : mizukiConfigRegistry;
	if (theme === "fuwari") return fuwariRegistry;
	return configRegistry;
}

/**
 * Mizuki v8.x（单文件 src/config.ts）注册表：
 * - 三个导出常量（siteConfig/profileConfig/fullscreenWallpaperConfig）都在 src/config.ts 里
 * - v8 的 fullscreenWallpaperConfig 没有 enable 字段，其余字段与 v9 同名
 */
export const mizukiSingleRegistry: ConfigEntry[] = [
	{
		file: "config.ts",
		exportName: "siteConfig",
		title: "站点基础",
		description: "站点标题、URL、时区与主题色等基础信息",
		fields: [
			{ path: "title", label: "站点标题", type: "string" },
			{ path: "subtitle", label: "站点副标题", type: "string" },
			{ path: "siteURL", label: "站点 URL", type: "string", tip: "以 / 结尾，例如 https://example.com/" },
			{ path: "siteStartDate", label: "建站日期", type: "string", tip: "格式 YYYY-MM-DD，用于运行天数统计" },
			{ path: "timeZone", label: "时区", type: "string", tip: "IANA 时区，如 Asia/Shanghai" },
			{ path: "themeColor.hue", label: "主题色相", type: "number", tip: "0-360，例如 240 为默认蓝紫" },
			{ path: "themeColor.fixed", label: "固定主题色", type: "boolean", tip: "开启后对访问者隐藏主题色选择器" },
			{ path: "tagStyle.useNewStyle", label: "标签新样式", type: "boolean", tip: "悬停高亮样式（新）或外框常亮样式（旧）" },
			{ path: "wallpaperMode.defaultMode", label: "壁纸模式", type: "select", options: ["banner", "fullscreen", "none"] },
			{ path: "banner.src.desktop", label: "横幅桌面图", type: "wallpaperDesktop", tip: "在「主页图片」页面管理，数组时轮播" },
			{ path: "banner.src.mobile", label: "横幅移动图", type: "wallpaperMobile", tip: "在「主页图片」页面管理" },
			{ path: "banner.homeText.enable", label: "启用主页横幅文字", type: "boolean" },
			{ path: "banner.homeText.title", label: "横幅主标题", type: "string" },
			{ path: "banner.homeText.subtitle", label: "横幅副标题", type: "stringArray", tip: "打字机开启时循环显示" },
		],
	},
	{
		file: "config.ts",
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
		file: "config.ts",
		exportName: "fullscreenWallpaperConfig",
		title: "全屏壁纸",
		description: "全屏壁纸桌面/移动图与显示效果（图片在「主页图片」页面管理）",
		fields: [
			{ path: "src.desktop", label: "桌面壁纸", type: "wallpaperDesktop", tip: "数组时轮播显示" },
			{ path: "src.mobile", label: "移动壁纸", type: "wallpaperMobile" },
			{ path: "position", label: "壁纸定位", type: "select", options: ["top", "center", "bottom"] },
			{ path: "carousel.enable", label: "启用轮播", type: "boolean" },
			{ path: "carousel.interval", label: "轮播间隔 (秒)", type: "number" },
			{ path: "opacity", label: "壁纸不透明度", type: "number", tip: "0-1" },
			{ path: "blur", label: "背景模糊半径 (px)", type: "number" },
		],
	},
];
