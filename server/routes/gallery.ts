import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { readPath, writePath } from "../config/ast.js";
import { activeDirs, ensureInside } from "../paths.js";
import { setGalleryCover, type ImageTarget } from "../media/images.js";
import { listImages } from "../media/images.js";
import { activeCapabilities } from "../theme.js";

function readGalleryConfig(): { albums: Record<string, unknown>[]; columnWidth: number } {
	const dir = activeDirs().configDir;
	const code = fs.readFileSync(path.join(dir, "galleryConfig.ts"), "utf-8");
	const albums = readPath(code, "galleryConfig", ["albums"]);
	const columnWidth = readPath(code, "galleryConfig", ["columnWidth"]);
	return {
		albums: (albums.found && Array.isArray(albums.value) ? albums.value : []) as Record<string, unknown>[],
		columnWidth: typeof columnWidth.value === "number" ? columnWidth.value : 240,
	};
}

/** 相册条目的可选字段：空值时不写入（与项目原格式一致） */
const ALBUM_OPTIONAL = new Set(["password", "passwordHint"]);

// ── Mizuki：public/images/albums/<id>/info.json 扫描式相册 ──

const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|svg|avif|bmp|tiff?)$/i;

function mizukiAlbumsDir(): string {
	return activeDirs().albumsDir;
}

function readMizukiInfo(albumDir: string): Record<string, unknown> {
	const infoPath = path.join(albumDir, "info.json");
	if (!fs.existsSync(infoPath)) return {};
	try {
		return JSON.parse(fs.readFileSync(infoPath, "utf-8")) as Record<string, unknown>;
	} catch {
		return {};
	}
}

/** 读取 Mizuki 全部相册（含 hidden），并映射为与 FireFly 相同的表单字段（name ← info.title） */
function listMizukiAlbums(): Record<string, unknown>[] {
	const base = mizukiAlbumsDir();
	if (!fs.existsSync(base)) return [];
	const albums: Record<string, unknown>[] = [];
	for (const name of fs.readdirSync(base)) {
		const dir = path.join(base, name);
		if (!fs.statSync(dir).isDirectory()) continue;
		const info = readMizukiInfo(dir);
		albums.push({
			id: name,
			name: String(info.title ?? name),
			description: String(info.description ?? ""),
			location: String(info.location ?? ""),
			date: String(info.date ?? ""),
			tags: Array.isArray(info.tags) ? info.tags.map(String) : [],
			password: String(info.password ?? ""),
			passwordHint: String(info.passwordHint ?? ""),
			hidden: info.hidden === true,
			photoCount: fs
				.readdirSync(dir)
				.filter((f) => IMAGE_EXTS.test(f) && !/^cover\./i.test(f)).length,
		});
	}
	return albums.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/** 把单个表单条目写回 info.json（保留 mode/cover/photos/hidden 等未知键；空可选键直接删除） */
function upsertMizukiAlbum(input: Record<string, unknown>): void {
	const id = String(input.id ?? "").trim();
	if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`相册 ID 非法: ${id}`);
	const dir = ensureInside(mizukiAlbumsDir(), path.join(mizukiAlbumsDir(), id));
	fs.mkdirSync(dir, { recursive: true });
	const info = readMizukiInfo(dir);
	info.title = String(input.name ?? id);
	if (String(input.description ?? "").trim()) info.description = String(input.description);
	else delete info.description;
	if (String(input.location ?? "").trim()) info.location = String(input.location);
	else delete info.location;
	if (String(input.date ?? "").trim()) info.date = String(input.date);
	else delete info.date;
	if (Array.isArray(input.tags) && input.tags.length > 0) info.tags = input.tags.map(String);
	else delete info.tags;
	if (String(input.password ?? "").trim()) info.password = String(input.password);
	else delete info.password;
	if (String(input.passwordHint ?? "").trim()) info.passwordHint = String(input.passwordHint);
	else delete info.passwordHint;
	fs.writeFileSync(path.join(dir, "info.json"), `${JSON.stringify(info, null, "\t")}\n`, "utf-8");
}

export const galleryRoutes = new Hono()
	.get("/", (c) => {
		const caps = activeCapabilities();
		if (caps.gallery === "scanner") {
			return c.json({ theme: caps.theme, albums: listMizukiAlbums(), columnWidth: null });
		}
		if (caps.gallery === null) {
			// Fuwari 等无相册主题：返回空列表而不是报错
			return c.json({ theme: caps.theme, albums: [], columnWidth: null });
		}
		const cfg = readGalleryConfig();
		return c.json({
			theme: caps.theme,
			albums: cfg.albums,
			columnWidth: cfg.columnWidth,
		});
	})
	.put("/", async (c) => {
		const caps = activeCapabilities();
		if (caps.gallery === null) {
			return c.json({ error: `该主题（${caps.theme}）没有相册功能` }, 400);
		}
		const body = (await c.req.json()) as {
			albums: Record<string, unknown>[];
			columnWidth?: number;
		};
		if (!Array.isArray(body.albums)) return c.json({ error: "参数错误" }, 400);
		// 校验 id 唯一与合法性
		const ids = body.albums.map((a) => String(a.id ?? "").trim());
		if (ids.some((id) => !/^[A-Za-z0-9_-]+$/.test(id))) {
			return c.json({ error: "相册 ID 只能包含字母、数字、- 和 _" }, 400);
		}
		if (new Set(ids).size !== ids.length) return c.json({ error: "相册 ID 重复" }, 400);
		if (activeCapabilities().gallery === "scanner") {
			// Mizuki：只增改（目录即相册，删除走显式 DELETE，避免保存时误删手工相册）
			for (const album of body.albums) upsertMizukiAlbum(album);
			return c.json({ ok: true });
		}
		// 可选字段为空时置 null（AST 引擎视为删除该键）
		const cleaned = body.albums.map((a) => {
			const out: Record<string, unknown> = { ...a };
			for (const key of ALBUM_OPTIONAL) {
				if (!String(out[key] ?? "").trim()) out[key] = null;
			}
			return out;
		});
		const dir = activeDirs().configDir;
		const file = path.join(dir, "galleryConfig.ts");
		let code = fs.readFileSync(file, "utf-8");
		code = writePath(code, "galleryConfig", ["albums"], cleaned);
		if (typeof body.columnWidth === "number") {
			code = writePath(code, "galleryConfig", ["columnWidth"], body.columnWidth);
		}
		fs.writeFileSync(file, code, "utf-8");
		return c.json({ ok: true });
	})
	// 显式删除相册（Mizuki：目录连同图片一并删除；FireFly 相册在配置中移除即可，不走这里）
	.delete("/:albumId", (c) => {
		const albumId = c.req.param("albumId");
		const caps = activeCapabilities();
		if (caps.gallery === null) {
			return c.json({ error: `该主题（${caps.theme}）没有相册功能` }, 400);
		}
		if (caps.gallery !== "scanner") {
			return c.json({ error: "FireFly 相册请在列表中移除后保存" }, 400);
		}
		if (!/^[A-Za-z0-9_-]+$/.test(albumId)) return c.json({ error: "相册 ID 非法" }, 400);
		const dir = ensureInside(mizukiAlbumsDir(), path.join(mizukiAlbumsDir(), albumId));
		if (!fs.existsSync(dir)) return c.json({ error: "相册目录不存在" }, 404);
		fs.rmSync(dir, { recursive: true, force: true });
		return c.json({ ok: true });
	})
	// 某相册的图片列表
	.get("/:albumId/images", (c) => {
		const albumId = c.req.param("albumId");
		return c.json({ images: listImages("gallery" as ImageTarget, albumId) });
	})
	// 设置相册封面
	.post("/:albumId/cover", async (c) => {
		const albumId = c.req.param("albumId");
		const body = (await c.req.json()) as { file: string };
		const r = await setGalleryCover(albumId, body.file);
		return c.json({ ok: true, ...r });
	});
