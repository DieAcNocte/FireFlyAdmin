/**
 * 主题适配层：探测激活博客项目的主题类型（FireFly / Mizuki / Fuwari），
 * 并据此声明各管理模块的可用形态（能力）。
 *
 * 探测依据是各主题的文件约定差异：
 * - FireFly：src/config/galleryConfig.ts（相册配置）、scripts/new-dynamic.js（动态脚本）、
 *   src/content/dynamic/（动态 markdown）
 * - Mizuki：src/data/ 数据文件目录（diary/friends/anime 等）、相册走 public/images/albums 扫描
 * - Fuwari（原型）：只有 src/config.ts + src/content/{posts,spec}，无相册/日记/壁纸模块
 *
 * Mizuki 还区分两种配置布局（能力里用 configLayout 表达）：
 * - dir：src/config/*.ts 多文件（v9+）
 * - single：src/config.ts 单文件（v8.x 与 Fuwari）
 */
import fs from "node:fs";
import path from "node:path";
import { getActiveProject, getPreferences } from "./settings.js";

export type ThemeId = "firefly" | "mizuki" | "fuwari" | "unknown";

export interface ThemeCapabilities {
	theme: ThemeId;
	/** 相册存储形态：config = galleryConfig.ts + public/gallery/<id>/；scanner = public/images/albums/<id>/info.json；null = 主题无相册 */
	gallery: "config" | "scanner" | null;
	/** 动态存储形态：markdown = src/content/dynamic/*.md；diaryTs = src/data/diary.ts 数组；null = 主题无动态 */
	dynamics: "markdown" | "diaryTs" | null;
	/** 动态是否支持置顶（Mizuki 日记无置顶概念） */
	dynamicsPinned: boolean;
	/** 壁纸配置形态：background = backgroundWallpaper.ts（FireFly）；mizuki = wallpaperMode + banner + fullscreenWallpaperConfig；null = 无独立壁纸配置 */
	wallpaper: "background" | "mizuki" | null;
	/** 配置文件布局：dir = src/config/*.ts；single = src/config.ts（Mizuki v8.x 与 Fuwari） */
	configLayout: "dir" | "single" | null;
	/** 是否支持 FireFly 演示内容重置 */
	demoReset: boolean;
}

const FIRE_FLY: ThemeCapabilities = {
	theme: "firefly",
	gallery: "config",
	dynamics: "markdown",
	dynamicsPinned: true,
	wallpaper: "background",
	configLayout: "dir",
	demoReset: true,
};

const FUWARI: ThemeCapabilities = {
	theme: "fuwari",
	gallery: null,
	dynamics: null,
	dynamicsPinned: false,
	wallpaper: null,
	configLayout: "single",
	demoReset: false,
};

const UNKNOWN: ThemeCapabilities = {
	theme: "unknown",
	gallery: null,
	dynamics: null,
	dynamicsPinned: false,
	wallpaper: null,
	configLayout: null,
	demoReset: false,
};

export function detectTheme(root: string): ThemeId {
	if (!root) return "unknown";
	const has = (rel: string) => fs.existsSync(path.join(root, rel));
	if (has("src/config/galleryConfig.ts") || has("scripts/new-dynamic.js")) return "firefly";
	if (has("src/data") || has("src/utils/album-scanner.ts")) return "mizuki";
	// Fuwari 原型：src/config.ts 单文件 + posts 内容集合，且没有任何派生主题的模块目录
	if (has("src/config.ts") && has("src/content/posts")) return "fuwari";
	return "unknown";
}

/** Mizuki 的配置布局：src/config/ 目录（v9+）或 src/config.ts 单文件（v8.x） */
function detectConfigLayout(root: string): "dir" | "single" | null {
	if (!root) return null;
	const has = (rel: string) => fs.existsSync(path.join(root, rel));
	if (has("src/config")) return "dir";
	if (has("src/config.ts")) return "single";
	return null;
}

export function capabilitiesFor(root: string): ThemeCapabilities {
	// 应用设置里的「博客模式」可手动指定主题（auto 时按文件约定自动识别）
	const prefs = getPreferences();
	const override = prefs.blogMode === "firefly" || prefs.blogMode === "mizuki" ? prefs.blogMode : null;
	const theme = override ?? detectTheme(root);
	if (theme === "firefly") return FIRE_FLY;
	if (theme === "fuwari") return FUWARI;
	if (theme === "mizuki") {
		return {
			theme,
			gallery: "scanner",
			dynamics: "diaryTs",
			dynamicsPinned: false,
			wallpaper: "mizuki",
			configLayout: detectConfigLayout(root),
			demoReset: false,
		};
	}
	return UNKNOWN;
}

export function activeCapabilities(): ThemeCapabilities {
	return capabilitiesFor(getActiveProject().localPath);
}
