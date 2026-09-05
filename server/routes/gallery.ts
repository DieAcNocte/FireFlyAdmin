import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { readPath, writePath } from "../config/ast.js";
import { activeDirs } from "../paths.js";
import { setGalleryCover, type ImageTarget } from "../media/images.js";
import { listImages } from "../media/images.js";

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

export const galleryRoutes = new Hono()
	.get("/", (c) => {
		const cfg = readGalleryConfig();
		return c.json({
			albums: cfg.albums,
			columnWidth: cfg.columnWidth,
		});
	})
	.put("/", async (c) => {
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
	// 某相册的图片列表
	.get("/:albumId/images", (c) => {
		const albumId = c.req.param("albumId");
		return c.json({ images: listImages("gallery" as ImageTarget, albumId) });
	})
	// 设置相册封面
	.post("/:albumId/cover", async (c) => {
		const albumId = c.req.param("albumId");
		const body = (await c.req.json()) as { file: string };
		const r = setGalleryCover(albumId, body.file);
		return c.json({ ok: true, ...r });
	});
