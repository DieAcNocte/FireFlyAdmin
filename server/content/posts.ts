import fs from "node:fs";
import path from "node:path";
import { pinyin } from "pinyin-pro";
import { parseFrontmatter, serializeFrontmatter, formatDate, type FmValue } from "./frontmatter.js";
import { activeDirs, ensureInside } from "../paths.js";
import { readPath } from "../config/ast.js";

/** 与博客 scripts/new-post.js 一致的中文转拼音 slug */
export function slugify(input: string): string {
	if (!/[一-鿿]/.test(input)) {
		return input
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");
	}
	const chars = [...input];
	const parts: string[] = [];
	let buf = "";
	for (const ch of chars) {
		if (/[一-鿿]/.test(ch)) {
			if (buf) {
				parts.push(buf);
				buf = "";
			}
			parts.push(pinyin(ch, { toneType: "none", type: "array" })[0]);
		} else {
			buf += ch;
		}
	}
	if (buf) parts.push(buf);
	return parts
		.join("-")
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function postsDir(): string {
	return activeDirs().postsDir;
}

/** 递归列出所有 md/mdx，返回相对路径（POSIX 风格） */
function walkPosts(dir: string, base = ""): string[] {
	const out: string[] = [];
	for (const name of fs.readdirSync(dir)) {
		const full = path.join(dir, name);
		const rel = base ? `${base}/${name}` : name;
		const st = fs.statSync(full);
		if (st.isDirectory()) out.push(...walkPosts(full, rel));
		else if (/\.(md|mdx)$/i.test(name)) out.push(rel);
	}
	return out;
}

export interface PostSummary {
	file: string;
	slug: string;
	title: string;
	published: string;
	updated: string;
	description: string;
	image: string;
	tags: string[];
	category: string;
	draft: boolean;
	pinned: boolean;
	series: string;
	seriesOrder?: number;
	hasPassword: boolean;
}

export function listPosts(): PostSummary[] {
	const dir = postsDir();
	if (!fs.existsSync(dir)) return [];
	const items: PostSummary[] = [];
	for (const rel of walkPosts(dir)) {
		try {
			const raw = fs.readFileSync(path.join(dir, rel), "utf-8");
			const { data } = parseFrontmatter(raw);
			items.push({
				file: rel,
				slug: String(data.slug ?? rel.replace(/\.(md|mdx)$/i, "")),
				title: String(data.title ?? "(无标题)"),
				published: formatDate(data.published),
				updated: formatDate(data.updated ?? ""),
				description: String(data.description ?? ""),
				image: String(data.image ?? ""),
				tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
				category: String(data.category ?? ""),
				draft: Boolean(data.draft),
				pinned: Boolean(data.pinned),
				series: String(data.series ?? ""),
				seriesOrder: typeof data.seriesOrder === "number" ? data.seriesOrder : undefined,
				hasPassword: Boolean(data.password),
			});
		} catch {
			/* 跳过解析失败的文件 */
		}
	}
	items.sort((a, b) => {
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		return b.published.localeCompare(a.published);
	});
	return items;
}

function resolvePostFile(rel: string): string {
	const file = ensureInside(postsDir(), path.join(postsDir(), rel));
	if (!/\.(md|mdx)$/i.test(file)) throw new Error("只支持 md/mdx 文件");
	if (!fs.existsSync(file)) throw new Error("文章不存在");
	return file;
}

export function getPost(rel: string): { file: string; data: Record<string, unknown>; body: string } {
	const file = resolvePostFile(rel);
	const raw = fs.readFileSync(file, "utf-8");
	const { data, body } = parseFrontmatter(raw);
	return { file: rel, data, body };
}

/** 依据模板顺序构建 frontmatter 条目（已知键在前，未知键保持原顺序在后） */
function buildPostEntries(data: Record<string, unknown>): Record<string, FmValue> {
	const knownOrder = [
		"title",
		"published",
		"description",
		"image",
		"tags",
		"category",
		"draft",
		"lang",
		"slug",
		"pinned",
		"updated",
		"series",
		"seriesOrder",
		"author",
		"sourceLink",
		"licenseName",
		"licenseUrl",
		"comment",
		"password",
		"passwordHint",
	];
	const entries: Record<string, FmValue> = {};
	const used = new Set<string>();
	for (const key of knownOrder) {
		if (data[key] === undefined) continue;
		if (key === "published") entries[key] = { type: "date", value: formatDate(data.published) };
		else if (key === "updated") entries[key] = { type: "date", value: formatDate(data.updated) };
		else if (key === "tags") entries[key] = Array.isArray(data.tags) ? data.tags.map(String) : [];
		else if (key === "seriesOrder") entries[key] = Number(data.seriesOrder);
		else if (key === "comment") entries[key] = Boolean(data.comment);
		else entries[key] = data[key] as string | boolean;
		used.add(key);
	}
	for (const [key, value] of Object.entries(data)) {
		if (used.has(key) || value === undefined || value === null || value === "") continue;
		entries[key] = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? { type: "date", value } : (value as FmValue);
	}
	return entries;
}

function renderPostFile(entries: Record<string, FmValue>, body: string): string {
	return `${serializeFrontmatter(entries)}\n\n${body.replace(/\s+$/, "")}\n`;
}

export function createPost(input: {
	title: string;
	slug?: string;
	published?: string;
	description?: string;
	image?: string;
	tags?: string[];
	category?: string;
	draft?: boolean;
	lang?: string;
	series?: string;
	seriesOrder?: number;
	password?: string;
	passwordHint?: string;
	body?: string;
}): { file: string } {
	const title = (input.title || "").trim();
	if (!title) throw new Error("标题不能为空");
	const slug = (input.slug || slugify(title)).trim();
	if (!slug || /[\\/]/.test(slug)) throw new Error("slug 非法（不能包含路径分隔符）");
	const file = path.join(postsDir(), `${slug}.md`);
	if (fs.existsSync(file)) throw new Error(`文章已存在: ${slug}.md`);

	const entries = buildPostEntries({
		title,
		published: input.published || formatDate(new Date()),
		description: input.description ?? "",
		image: input.image ?? "",
		tags: input.tags ?? [],
		category: input.category ?? "",
		draft: input.draft ?? false,
		lang: input.lang ?? "",
		slug,
		series: input.series || undefined,
		seriesOrder: input.seriesOrder,
		password: input.password || undefined,
		passwordHint: input.passwordHint || undefined,
	});
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, renderPostFile(entries, input.body || ""), "utf-8");
	return { file: `${slug}.md` };
}

export function updatePost(
	rel: string,
	input: {
		title?: string;
		slug?: string;
		published?: string;
		updated?: string;
		description?: string;
		image?: string;
		tags?: string[];
		category?: string;
		draft?: boolean;
		lang?: string;
		pinned?: boolean;
		series?: string;
		seriesOrder?: number;
		comment?: boolean;
		password?: string;
		passwordHint?: string;
		body?: string;
	}
): { file: string } {
	const oldFile = resolvePostFile(rel);
	const { data: existing, body: existingBody } = parseFrontmatter(fs.readFileSync(oldFile, "utf-8"));

	// 合并：现有 frontmatter 为底，表单值覆盖
	const merged: Record<string, unknown> = { ...existing };
	const formKeys: (keyof typeof input)[] = [
		"title",
		"slug",
		"published",
		"updated",
		"description",
		"image",
		"tags",
		"category",
		"draft",
		"lang",
		"pinned",
		"series",
		"seriesOrder",
		"comment",
		"password",
		"passwordHint",
	];
	for (const key of formKeys) {
		const v = input[key];
		if (v !== undefined) merged[key] = v;
	}
	// 清空的可选字段：移除键（而不是写入空字符串）
	for (const key of ["password", "passwordHint", "series", "author", "sourceLink", "licenseName", "licenseUrl"]) {
		if (merged[key] === "") delete merged[key];
	}

	// slug 变更 → 重命名文件
	const oldSlug = String(existing.slug ?? rel.replace(/\.(md|mdx)$/i, ""));
	const newSlug = String(merged.slug ?? oldSlug);
	let targetFile = oldFile;
	if (newSlug !== oldSlug) {
		if (!newSlug || /[\\/]/.test(newSlug)) throw new Error("slug 非法");
		const candidate = path.join(path.dirname(oldFile), `${newSlug}.md`);
		if (fs.existsSync(candidate)) throw new Error(`目标文件已存在: ${newSlug}.md`);
		targetFile = candidate;
	}
	merged.slug = newSlug;

	fs.writeFileSync(targetFile, renderPostFile(buildPostEntries(merged), input.body ?? existingBody), "utf-8");
	if (targetFile !== oldFile) fs.rmSync(oldFile);
	return { file: path.basename(targetFile) };
}

export function deletePost(rel: string): void {
	const file = resolvePostFile(rel);
	fs.rmSync(file);
}

/** 从 siteConfig 读取时区（失败回退 Asia/Shanghai） */
export function getBlogTimezone(): string {
	try {
		const dir = activeDirs().configDir;
		const code = fs.readFileSync(path.join(dir, "siteConfig.ts"), "utf-8");
		const r = readPath(code, "siteConfig", ["timezone"]);
		if (r.found && typeof r.value === "string" && r.value) return r.value;
	} catch {
		/* ignore */
	}
	return "Asia/Shanghai";
}
