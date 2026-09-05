import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { activeDirs, ensureInside, projectDirs } from "../paths.js";
import type { ProjectProfile } from "../settings.js";

export type ImageTarget = "wallpaper-desktop" | "wallpaper-mobile" | "post-images" | "gallery";

export function targetDir(target: ImageTarget, albumId?: string, project?: ProjectProfile): string {
	const dirs = project ? projectDirs(project) : activeDirs();
	switch (target) {
		case "wallpaper-desktop":
			return dirs.desktopWallpaperDir;
		case "wallpaper-mobile":
			return dirs.mobileWallpaperDir;
		case "post-images":
			return dirs.postImagesDir;
		case "gallery": {
			if (!albumId || !/^[A-Za-z0-9_-]+$/.test(albumId)) throw new Error("相册 ID 非法");
			return path.join(dirs.galleryDir, albumId);
		}
	}
	throw new Error("未知的目标目录");
}

function sanitizeName(name: string): string {
	const base = path.basename(name).replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_");
	return base || "image";
}

function listDir(dir: string): { name: string; size: number; mtime: number; url: string }[] {
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir)
		.filter((f) => fs.statSync(path.join(dir, f)).isFile())
		.map((f) => {
			const st = fs.statSync(path.join(dir, f));
			return {
				name: f,
				size: st.size,
				mtime: st.mtimeMs,
				url: mediaUrlFor(dir, path.join(dir, f)),
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** 根据绝对目录反查 media URL 的 root 参数（相册目录相对 gallery 根，保留子目录层级） */
function mediaUrlFor(dir: string, file: string): string {
	const dirs = activeDirs();
	let root = "gallery";
	let base = dirs.galleryDir;
	if (dir === dirs.desktopWallpaperDir) {
		root = "desktop";
		base = dir;
	} else if (dir === dirs.mobileWallpaperDir) {
		root = "mobile";
		base = dir;
	} else if (dir === dirs.postImagesDir) {
		root = "posts";
		base = dir;
	}
	const rel = path.relative(base, file).split(path.sep).join("/");
	return `/api/media?root=${root}&f=${encodeURIComponent(rel)}`;
}

export function listImages(target: ImageTarget, albumId?: string) {
	return listDir(targetDir(target, albumId));
}

export async function saveImages(
	files: { name: string; buffer: Buffer }[],
	target: ImageTarget,
	albumId: string | undefined,
	convertAvif: boolean
): Promise<{ saved: string[] }> {
	const dir = targetDir(target, albumId);
	fs.mkdirSync(dir, { recursive: true });
	const saved: string[] = [];
	for (const f of files) {
		const clean = sanitizeName(f.name);
		const ext = path.extname(clean).toLowerCase();
		const stem = path.basename(clean, ext);
		let outName = clean;
		let data = f.buffer;
		if (convertAvif && ext !== ".avif") {
			data = await sharp(f.buffer).avif({ quality: 80 }).toBuffer();
			outName = `${stem}.avif`;
		}
		// 重名自动加序号
		let finalName = outName;
		let i = 1;
		while (fs.existsSync(path.join(dir, finalName))) {
			finalName = `${stem}-${i}${path.extname(outName)}`;
			i++;
		}
		fs.writeFileSync(path.join(dir, finalName), data);
		saved.push(finalName);
	}
	return { saved };
}

export function deleteImage(target: ImageTarget, name: string, albumId?: string): void {
	const dir = targetDir(target, albumId);
	const file = ensureInside(dir, path.join(dir, sanitizeName(name)));
	if (!fs.existsSync(file)) throw new Error("文件不存在");
	fs.rmSync(file);
}

/** 将相册中的某张图设为封面：命名为 cover.<原扩展名>（删除旧封面文件） */
export function setGalleryCover(albumId: string, name: string): { cover: string } {
	const dir = targetDir("gallery", albumId);
	const src = ensureInside(dir, path.join(dir, sanitizeName(name)));
	if (!fs.existsSync(src)) throw new Error("文件不存在");
	// 移除现有 cover.*
	for (const f of fs.readdirSync(dir)) {
		if (/^cover\./i.test(f)) fs.rmSync(path.join(dir, f));
	}
	const ext = path.extname(name).toLowerCase();
	const dest = path.join(dir, `cover${ext}`);
	fs.renameSync(src, dest);
	return { cover: `cover${ext}` };
}

const MIME: Record<string, string> = {
	".avif": "image/avif",
	".webp": "image/webp",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".mp4": "video/mp4",
	".webm": "video/webm",
};

export function mimeOf(ext: string): string {
	return MIME[ext.toLowerCase()] ?? "application/octet-stream";
}
