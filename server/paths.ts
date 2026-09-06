import path from "node:path";
import { getActiveProject, type ProjectProfile } from "./settings.js";

/** 当前激活项目的各内容目录 */
export function projectDirs(project: ProjectProfile) {
	const root = project.localPath;
	return {
		root,
		configDir: path.join(root, "src", "config"),
		postsDir: path.join(root, "src", "content", "posts"),
		postImagesDir: path.join(root, "src", "content", "posts", "images"),
		dynamicDir: path.join(root, "src", "content", "dynamic"),
		specDir: path.join(root, "src", "content", "spec"),
		galleryDir: path.join(root, "public", "gallery"),
		desktopWallpaperDir: path.join(root, "src", "assets", "images", "DesktopWallpaper"),
		mobileWallpaperDir: path.join(root, "src", "assets", "images", "MobileWallpaper"),
	};
}

export function activeDirs() {
	return projectDirs(getActiveProject());
}

/** 防目录穿越：确认 target 在 baseDir 内 */
export function ensureInside(baseDir: string, target: string): string {
	const resolvedBase = path.resolve(baseDir);
	const resolved = path.resolve(target);
	if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
		throw new Error("非法路径");
	}
	return resolved;
}
