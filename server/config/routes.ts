import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { getConfigRegistry, type FieldSpec } from "./registry.js";
import { readPath, writePath, type PathSegment } from "./ast.js";
import { activeDirs, ensureInside } from "../paths.js";
import { activeCapabilities } from "../theme.js";

/** 配置/数据文件定位：Mizuki 额外允许 "data/<name>.ts" 指向 src/data/；v8.x 单文件布局指向 src/config.ts */
function configFilePath(file: string): string {
	const m = file.match(/^(data\/)?([A-Za-z0-9_-]+\.tsx?)$/);
	if (!m) throw new Error("非法配置文件名");
	const caps = activeCapabilities();
	if (m[1]) {
		if (caps.theme !== "mizuki") throw new Error("该主题不支持数据文件编辑");
		const base = activeDirs().dataDir;
		return ensureInside(base, path.join(base, m[2]));
	}
	if (caps.configLayout === "single" && (caps.theme === "mizuki" || caps.theme === "fuwari")) {
		if (m[2] !== "config.ts") throw new Error("该主题的配置集中在 src/config.ts");
		const base = activeDirs().srcDir;
		return ensureInside(base, path.join(base, "config.ts"));
	}
	const base = activeDirs().configDir;
	return ensureInside(base, path.join(base, m[2]));
}

function readConfig(file: string): string {
	return fs.readFileSync(configFilePath(file), "utf-8");
}

function writeConfig(file: string, content: string): void {
	fs.writeFileSync(configFilePath(file), content, "utf-8");
}

function segmentsOf(dotPath: string): PathSegment[] {
	return dotPath.split(".").map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

/** 按字段声明清洗值：可选字段为空时返回 null（AST 引擎把 null 视为"删除该键"） */
function cleanFieldValue(field: { type: string; optional?: boolean }, value: unknown): unknown {
	if (value === undefined || value === null) return undefined;
	if (field.optional && typeof value === "string" && value.trim() === "") return null;
	if (field.optional && Array.isArray(value) && value.length === 0) return null;
	return value;
}

/** 把 UI 传来的对象数组按 itemFields 清洗（可选字段为空 → null，保持键不写入） */
function cleanItemArray(field: FieldSpec, items: unknown[]): Record<string, unknown>[] {
	if (!field.itemFields) return items as Record<string, unknown>[];
	return items.map((raw) => {
		const item = (raw ?? {}) as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const f of field.itemFields!) {
			const v = cleanFieldValue(f, item[f.key]);
			if (v !== undefined) out[f.key] = v;
		}
		return out;
	});
}

function prepareFieldValue(field: FieldSpec, value: unknown): unknown {
	if (field.type === "arrayOfObjects" && Array.isArray(value)) {
		return cleanItemArray(field, value);
	}
	if (Array.isArray(value)) {
		return value.filter((v) => typeof v === "string" && v.trim() !== "");
	}
	return cleanFieldValue(field, value);
}

export const configRoutes = new Hono()
	// 注册表元信息（随激活项目的主题与配置布局切换）
	.get("/", (c) => {
		const caps = activeCapabilities();
		return c.json({ theme: caps.theme, configLayout: caps.configLayout, entries: getConfigRegistry(caps.theme, caps.configLayout) });
	})
	// 全部配置文件清单（供源码编辑；Mizuki 额外列出 src/data/ 数据文件）
	.get("/raw/all", (c) => {
		const dirs = activeDirs();
		const caps = activeCapabilities();
		const listDir = (dir: string, prefix: string) =>
			fs
				.readdirSync(dir)
				.filter((f) => /\.tsx?$/.test(f))
				.map((f) => {
					const st = fs.statSync(path.join(dir, f));
					return { file: `${prefix}${f}`, size: st.size, mtime: st.mtimeMs };
				});
		let files: { file: string; size: number; mtime: number }[];
		if (caps.configLayout === "single" && (caps.theme === "mizuki" || caps.theme === "fuwari")) {
			// 单文件布局：src 顶层 .ts（排除 .d.ts），主要是 config.ts
			files = fs.existsSync(dirs.srcDir)
				? fs
						.readdirSync(dirs.srcDir)
						.filter((f) => /\.tsx?$/.test(f) && !/\.d\.tsx?$/.test(f))
						.map((f) => {
							const st = fs.statSync(path.join(dirs.srcDir, f));
							return { file: f, size: st.size, mtime: st.mtimeMs };
						})
				: [];
		} else {
			files = fs.existsSync(dirs.configDir) ? listDir(dirs.configDir, "") : [];
		}
		if (caps.theme === "mizuki" && fs.existsSync(dirs.dataDir)) {
			files.push(...listDir(dirs.dataDir, "data/"));
		}
		files.sort((a, b) => a.file.localeCompare(b.file));
		return c.json({ files });
	})
	// 读取源码（:file 可含 data/ 前缀，故用通配参数）
	.get("/raw/:file{.+}", (c) => {
		const file = c.req.param("file");
		return c.json({ file, content: readConfig(file) });
	})
	// 保存源码
	.put("/raw/:file{.+}", async (c) => {
		const file = c.req.param("file");
		const body = (await c.req.json()) as { content: string };
		if (typeof body.content !== "string") return c.json({ error: "参数错误" }, 400);
		writeConfig(file, body.content);
		return c.json({ ok: true });
	})
	// 某个配置文件：所有注册字段的当前值
	.get("/:file", (c) => {
		const file = c.req.param("file");
		const caps = activeCapabilities();
		const entry = getConfigRegistry(caps.theme, caps.configLayout).find((e) => e.file === file);
		if (!entry) return c.json({ error: "未注册的配置文件" }, 404);
		const code = readConfig(file);
		const fields = entry.fields.map((f) => {
			const r = readPath(code, entry.exportName, segmentsOf(f.path));
			return { ...f, value: r.found ? (r.value ?? null) : null, readError: r.error ?? null, exists: r.found };
		});
		return c.json({ file: entry.file, exportName: entry.exportName, title: entry.title, fields });
	})
	// 批量写回字段（一次请求内顺序应用，只写一次文件）
	.put("/:file/fields", async (c) => {
		const file = c.req.param("file");
		const caps = activeCapabilities();
		const entry = getConfigRegistry(caps.theme, caps.configLayout).find((e) => e.file === file);
		if (!entry) return c.json({ error: "未注册的配置文件" }, 404);
		const body = (await c.req.json()) as { values: { path: string; value: unknown }[] };
		if (!Array.isArray(body.values)) return c.json({ error: "参数错误" }, 400);
		let code = readConfig(file);
		const applied: string[] = [];
		for (const { path: dotPath, value } of body.values) {
			const field = entry.fields.find((f) => f.path === dotPath);
			if (!field) return c.json({ error: `未注册的字段: ${dotPath}` }, 400);
			const v = prepareFieldValue(field, value);
			if (v === undefined || v === null) continue;
			code = writePath(code, entry.exportName, segmentsOf(dotPath), v);
			applied.push(dotPath);
		}
		writeConfig(file, code);
		return c.json({ ok: true, applied });
	});
