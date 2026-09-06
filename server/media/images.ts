import fs from "node:fs";
import path from "node:path";
import { activeDirs, ensureInside, projectDirs } from "../paths.js";
import { ROOT_DIR, getActiveProject, type ProjectProfile } from "../settings.js";
import { capabilitiesFor } from "../theme.js";

/** sharp 为原生模块，无法嵌入 SEA 单文件 EXE：运行时懒加载（优先常规解析，回退到项目根 node_modules） */
let sharpModule: any | null | undefined;
async function getSharp(): Promise<any | null> {
	if (sharpModule !== undefined) return sharpModule;
	try {
		sharpModule = (await import("sharp")).default ?? (await import("sharp"));
		return sharpModule;
	} catch {
		/* 常规解析失败 */
	}
	try {
		const { createRequire } = await import("node:module");
		const req = createRequire(path.join(ROOT_DIR, "package.json"));
		sharpModule = req("sharp");
	} catch {
		sharpModule = null;
	}
	return sharpModule;
}

export type ImageTarget = "wallpaper-desktop" | "wallpaper-mobile" | "post-images" | "gallery";

export function targetDir(target: ImageTarget, albumId?: string, project?: ProjectProfile): string {
	const dirs = project ? projectDirs(project) : activeDirs();
	// Mizuki：壁纸图 v9 在 public/assets/*-banner，v8.x（单文件布局）在 public/images；相册在 public/images/albums
	const root = project ? project.localPath : getActiveProject().localPath;
	const caps = capabilitiesFor(root);
	const mizuki = caps.theme === "mizuki";
	switch (target) {
		case "wallpaper-desktop":
			return mizuki ? (caps.configLayout === "single" ? dirs.publicImagesDir : dirs.bannerDesktopDir) : dirs.desktopWallpaperDir;
		case "wallpaper-mobile":
			return mizuki ? (caps.configLayout === "single" ? dirs.publicImagesDir : dirs.bannerMobileDir) : dirs.mobileWallpaperDir;
		case "post-images":
			return dirs.postImagesDir;
		case "gallery": {
			if (!albumId || !/^[A-Za-z0-9_-]+$/.test(albumId)) throw new Error("相册 ID 非法");
			const base = mizuki ? dirs.albumsDir : dirs.galleryDir;
			return path.join(base, albumId);
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
		.filter((f) => f !== "info.json" && fs.statSync(path.join(dir, f)).isFile())
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
	if (dir === dirs.bannerDesktopDir) {
		root = "desktop";
		base = dir;
	} else if (dir === dirs.bannerMobileDir) {
		root = "mobile";
		base = dir;
	} else if (dir === dirs.publicImagesDir) {
		// Mizuki v8.x：桌面/移动壁纸同在 public/images，媒体端点两侧都映射到该目录
		root = "desktop";
		base = dir;
	} else if (dir === dirs.albumsDir || dir.startsWith(dirs.albumsDir + path.sep)) {
		// Mizuki 相册（dir 可能是某个相册子目录）：base 必须是相册根，保持 <albumId>/xx.ext 层级
		root = "gallery";
		base = dirs.albumsDir;
	} else if (dir === dirs.desktopWallpaperDir) {
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
	let sharp: any = undefined;
	for (const f of files) {
		const clean = sanitizeName(f.name);
		const ext = path.extname(clean).toLowerCase();
		const stem = path.basename(clean, ext);
		let outName = clean;
		let data = f.buffer;
		if (convertAvif && ext !== ".avif") {
			if (sharp === undefined) {
				sharp = await getSharp();
				if (!sharp) {
					throw new Error("未找到 sharp，无法转换 AVIF。请在管理后台目录保留 node_modules，或关闭「转 AVIF」后上传原图。");
				}
			}
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

/**
 * 将相册中的某张图设为封面：命名为 cover.<原扩展名>（删除旧封面文件）。
 * Mizuki 相册的扫描器只识别 cover.webp / cover.jpg，其他格式先转码为 webp（保留原图）。
 */
export async function setGalleryCover(albumId: string, name: string): Promise<{ cover: string }> {
	const dir = targetDir("gallery", albumId);
	const src = ensureInside(dir, path.join(dir, sanitizeName(name)));
	if (!fs.existsSync(src)) throw new Error("文件不存在");
	// 移除现有 cover.*
	for (const f of fs.readdirSync(dir)) {
		if (/^cover\./i.test(f)) fs.rmSync(path.join(dir, f));
	}
	const ext = path.extname(name).toLowerCase();
	const mizuki = capabilitiesFor(getActiveProject().localPath).theme === "mizuki";
	if (mizuki && ext !== ".webp" && ext !== ".jpg") {
		const sharp = await getSharp();
		if (!sharp) throw new Error("Mizuki 相册封面只支持 webp/jpg，且转码需要 sharp（请在管理后台目录保留 node_modules）");
		const dest = path.join(dir, "cover.webp");
		await sharp(src).webp({ quality: 85 }).toBuffer().then((data: Buffer) => fs.writeFileSync(dest, data));
		return { cover: "cover.webp" };
	}
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
