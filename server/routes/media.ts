import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import {
	listImages,
	saveImages,
	deleteImage,
	mimeOf,
	type ImageTarget,
} from "../media/images.js";
import { activeDirs, ensureInside } from "../paths.js";

const TARGETS: ImageTarget[] = ["wallpaper-desktop", "wallpaper-mobile", "post-images", "gallery"];

/** 预览媒体文件的根目录映射 */
function mediaRoot(root: string): string {
	const dirs = activeDirs();
	switch (root) {
		case "desktop":
			return dirs.desktopWallpaperDir;
		case "mobile":
			return dirs.mobileWallpaperDir;
		case "posts":
			return dirs.postImagesDir;
		case "gallery":
			return dirs.galleryDir;
	}
	throw new Error("非法的媒体目录");
}

export const mediaRoutes = new Hono()
	.get("/images", (c) => {
		const target = (c.req.query("target") || "") as ImageTarget;
		if (!TARGETS.includes(target)) return c.json({ error: "未知的目标目录" }, 400);
		return c.json({ images: listImages(target, c.req.query("albumId")) });
	})
	// 上传图片（multipart: files[] + target + albumId? + convertAvif?）
	.post("/images", async (c) => {
		const form = await c.req.parseBody({ all: true });
		const target = String(form.target || "") as ImageTarget;
		if (!TARGETS.includes(target)) return c.json({ error: "未知的目标目录" }, 400);
		const albumId = form.albumId ? String(form.albumId) : undefined;
		const convertAvif = String(form.convertAvif || "") === "true";
		const rawFiles = Array.isArray(form.files) ? form.files : [form.files];
		const files: { name: string; buffer: Buffer }[] = [];
		for (const f of rawFiles) {
			if (f && typeof f === "object" && "arrayBuffer" in f) {
				const filePart = f as File;
				files.push({ name: filePart.name || "image", buffer: Buffer.from(await filePart.arrayBuffer()) });
			}
		}
		if (files.length === 0) return c.json({ error: "未收到文件" }, 400);
		const result = await saveImages(files, target, albumId, convertAvif);
		return c.json({ ok: true, ...result });
	})
	.delete("/images", (c) => {
		const target = (c.req.query("target") || "") as ImageTarget;
		const name = c.req.query("name") || "";
		if (!TARGETS.includes(target)) return c.json({ error: "未知的目标目录" }, 400);
		deleteImage(target, name, c.req.query("albumId"));
		return c.json({ ok: true });
	})
	// 媒体文件预览（壁纸/相册/文章插图）
	.get("/media", (c) => {
		const root = c.req.query("root") || "";
		const rel = c.req.query("f") || "";
		const baseDir = mediaRoot(root);
		const file = ensureInside(baseDir, path.join(baseDir, rel));
		if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return c.text("文件不存在", 404);
		const data = fs.readFileSync(file);
		return c.body(data, 200, {
			"Content-Type": mimeOf(path.extname(file)),
			"Cache-Control": "no-cache",
		});
	});
