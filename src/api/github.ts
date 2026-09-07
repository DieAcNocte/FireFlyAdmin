/**
 * GitHub 直连后端：不依赖电脑端服务，App 直接通过 GitHub Contents API 读写博客仓库。
 * 每次保存/删除即一次 commit；远端冲突或失败会以 Error 形式返回（即「是否更改成功」的反馈）。
 *
 * 支持范围（v1）：
 * - 文章：src/content/posts 下所有 .md/.mdx（含子目录；增删改查、slug 重命名）
 * - 动态：src/content/dynamic 下的 .md（FireFly markdown 形态；Mizuki diary.ts 不支持）
 * - 页面：src/content/spec 下的 .md/.mdx
 * - 文章配图上传：src/content/posts/images
 * frontmatter 解析/序列化与 server/content/frontmatter.ts 保持一致（见 lib/matter.ts）。
 */
import type { PostSummary, PostDetail, DynamicItem, SpecPage, ThemeCapabilities, ConfigEntry, FieldSpec, GitCommit, GalleryImage } from "./index";
import type { PathSegment } from "../lib/ast";
import { parseFrontmatter, serializeFrontmatter, formatDate, formatDateTime, nowInZone, type FmValue } from "../lib/matter";
import { getConfigRegistry } from "../lib/configRegistry";
import { ghConfig, deviceBlogMode } from "./base";
import { seedText, seedListDir, seedExists, seedResolve, useSeedMode as useSeed, localizeUrl, localizeRemoteImages } from "../lib/seedRepo";

/**
 * AST 引擎（内含 TypeScript 编译器，体积较大）懒加载：
 * 仅在直连模式使用站点配置/日记编辑时才下载对应 chunk
 */
type AstModule = typeof import("../lib/ast");
let astPromise: Promise<AstModule> | null = null;
function loadAst(): Promise<AstModule> {
	return (astPromise ??= import("../lib/ast"));
}

// ── GitHub HTTP 基础 ──

const GH_API = "https://api.github.com";
const POSTS_DIR = "src/content/posts";
const POST_IMAGES_DIR = "src/content/posts/images";
const DYNAMIC_DIR = "src/content/dynamic";
const SPEC_DIR = "src/content/spec";

class GhHttpError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

interface GhContent {
	name: string;
	path: string;
	type: "file" | "dir";
	sha: string;
	size: number;
	content?: string;
	encoding?: string;
}

function repoPath(path: string): string {
	const cfg = ghConfig.value;
	return `/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
}

async function ghApi<T>(method: string, path: string, body?: unknown): Promise<T> {
	const cfg = ghConfig.value;
	if (!cfg.owner || !cfg.repo) throw new Error("尚未配置 GitHub 仓库，请在连接设置中填写");
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
	let res: Response;
	try {
		res = await fetch(`${GH_API}${path}`, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
	} catch {
		throw new Error("无法连接 GitHub，请检查网络");
	}
	if (!res.ok) throw await ghHttpError(res);
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

async function ghHttpError(res: Response): Promise<GhHttpError> {
	let msg = "";
	try {
		msg = (await res.json())?.message ?? "";
	} catch {
		/* ignore */
	}
	if (res.status === 401) return new GhHttpError(401, "GitHub 令牌无效或已过期，请在连接设置中更新");
	if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
		return new GhHttpError(403, "GitHub API 请求次数已达上限，请稍后再试");
	}
	if (res.status === 404) return new GhHttpError(404, `仓库或文件不存在（404）：${msg}`);
	if (res.status === 409 || res.status === 422) return new GhHttpError(res.status, `远端内容已变化或参数冲突（${res.status}）：${msg}`);
	return new GhHttpError(res.status, `GitHub 请求失败 (${res.status})：${msg}`);
}

// ── base64 / 编码 ──

function b64ToUtf8(b64: string): string {
	const bin = atob(b64.replace(/\s/g, ""));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new TextDecoder("utf-8").decode(bytes);
}

function utf8ToB64(str: string): string {
	const bytes = new TextEncoder().encode(str);
	let bin = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(bin);
}

async function fileToB64(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let bin = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(bin);
}

// ── 文件读写原语 ──

/** 列目录（不存在返回空数组） */
async function listDir(path: string): Promise<GhContent[]> {
	if (useSeed()) return await seedListDir(path);
	try {
		const r = await ghApi<GhContent[] | GhContent>("GET", `${repoPath(path)}?ref=${encodeURIComponent(ghConfig.value.branch)}`);
		return Array.isArray(r) ? r : [r];
	} catch (e) {
		if (e instanceof GhHttpError && e.status === 404) return [];
		throw e;
	}
}

/** 读文本文件，返回内容与 sha；不存在返回 null */
async function getText(path: string): Promise<{ content: string; sha: string } | null> {
	if (useSeed()) {
		const t = await seedText(path);
		return t === null ? null : { content: t, sha: "seed" };
	}
	let r: GhContent;
	try {
		r = await ghApi<GhContent>("GET", `${repoPath(path)}?ref=${encodeURIComponent(ghConfig.value.branch)}`);
	} catch (e) {
		if (e instanceof GhHttpError && e.status === 404) return null;
		throw e;
	}
	if (r.type !== "file") return null;
	if (r.encoding !== "base64") {
		if ((r.content ?? "").length > 0 && r.encoding === undefined) {
			// raw 形态（某些场景直接返回文本）
			return { content: r.content ?? "", sha: r.sha };
		}
		throw new Error(`无法读取文件 ${path}（编码 ${r.encoding ?? "未知"}）`);
	}
	if ((r.size ?? 0) > 1024 * 1024) throw new Error(`文件 ${path} 超过 1MB，请在电脑端编辑`);
	return { content: b64ToUtf8(r.content ?? ""), sha: r.sha };
}

/** 写文本文件（sha 为 null 表示新建；远端已变化时报错） */
async function putFile(path: string, content: string, sha: string | null, message: string): Promise<void> {
	if (useSeed()) throw new Error("模板快照为只读：在「连接设置」中换成你自己的博客仓库并填写 PAT 后即可编辑");
	try {
		await ghApi("PUT", repoPath(path), {
			message,
			content: utf8ToB64(content),
			branch: ghConfig.value.branch,
			...(sha ? { sha } : {}),
		});
	} catch (e) {
		if (e instanceof GhHttpError && !sha && (e.status === 422 || e.status === 409)) {
			throw new Error(`文件已存在于远端：${path}`);
		}
		if (e instanceof GhHttpError && sha && (e.status === 422 || e.status === 409)) {
			throw new Error("远端文件已被修改（可能在其他设备上），请刷新列表后重试，本次修改未提交");
		}
		throw e;
	}
}

/** 写二进制文件（内容为 base64） */
async function putFileB64(path: string, contentB64: string, sha: string | null, message: string): Promise<void> {
	if (useSeed()) throw new Error("模板快照为只读：在「连接设置」中换成你自己的博客仓库并填写 PAT 后即可上传");
	try {
		await ghApi("PUT", repoPath(path), {
			message,
			content: contentB64,
			branch: ghConfig.value.branch,
			...(sha ? { sha } : {}),
		});
	} catch (e) {
		if (e instanceof GhHttpError && !sha && (e.status === 422 || e.status === 409)) {
			throw new Error(`文件已存在于远端：${path}`);
		}
		throw e;
	}
}

async function deleteFile(path: string, sha: string, message: string): Promise<void> {
	if (useSeed()) throw new Error("模板快照为只读：在「连接设置」中换成你自己的博客仓库并填写 PAT 后即可编辑");
	await ghApi("DELETE", repoPath(path), { message, sha, branch: ghConfig.value.branch });
}

// ── 提交信息 ──

function commitMessage(defaultMessage: string): string {
	return ghConfig.value.commitMessage.trim() || defaultMessage;
}

// ── slug（与博客 scripts/new-post.js 一致的中文转拼音）──

async function slugify(input: string): Promise<string> {
	if (!/[一-鿿]/.test(input)) {
		return input
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");
	}
	const { pinyin } = await import("pinyin-pro");
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

// ── 主题能力探测 ──

let cachedCaps: ThemeCapabilities | null = null;
let cachedOverride: string = "";

/** 判断请求路径的文件/目录是否存在（供主题能力探测） */
async function exists(path: string): Promise<boolean> {
	if (useSeed()) return await seedExists(path);
	try {
		await ghApi("GET", `${repoPath(path)}?ref=${encodeURIComponent(ghConfig.value.branch)}`);
		return true;
	} catch (e) {
		if (e instanceof GhHttpError && e.status === 404) return false;
		throw e;
	}
}

/** 主题能力探测：支持手机本地「博客模式」覆盖（与 server/theme.ts capabilitiesFor 行为一致） */
async function detectCapabilities(): Promise<ThemeCapabilities> {
	const override = deviceBlogMode.value === "firefly" || deviceBlogMode.value === "mizuki" ? deviceBlogMode.value : "";
	if (cachedCaps && cachedOverride === override) return cachedCaps;
	const configDir = await exists("src/config");
	const [galleryConfig, newDynamic, srcData, albumScanner, srcConfigTs] = await Promise.all([
		exists("src/config/galleryConfig.ts"),
		exists("scripts/new-dynamic.js"),
		exists("src/data"),
		exists("src/utils/album-scanner.ts"),
		exists("src/config.ts"),
	]);
	let caps: ThemeCapabilities;
	if (override === "firefly" || (!override && (galleryConfig || newDynamic))) {
		caps = { theme: "firefly", gallery: "config", dynamics: "markdown", dynamicsPinned: true, wallpaper: "background", configLayout: "dir", demoReset: false };
	} else if (override === "mizuki" || (!override && (srcData || albumScanner))) {
		caps = { theme: "mizuki", gallery: "scanner", dynamics: "diaryTs", dynamicsPinned: false, wallpaper: "mizuki", configLayout: configDir ? "dir" : "single", demoReset: false };
	} else if (srcConfigTs && (await exists("src/content/posts"))) {
		caps = { theme: "fuwari", gallery: null, dynamics: null, dynamicsPinned: false, wallpaper: null, configLayout: "single", demoReset: false };
	} else {
		caps = { theme: "unknown", gallery: null, dynamics: null, dynamicsPinned: false, wallpaper: null, configLayout: null, demoReset: false };
	}
	cachedCaps = caps;
	cachedOverride = override;
	return caps;
}

/** 从 siteConfig.ts 读取时区（正则提取，失败回退 Asia/Shanghai） */
async function blogTimezone(): Promise<string> {
	try {
		const f = await getText("src/config/siteConfig.ts");
		const m = f?.content.match(/timezone\s*:\s*["'`]([^"'`]+)["'`]/);
		if (m?.[1]) return m[1];
	} catch {
		/* ignore */
	}
	return "Asia/Shanghai";
}

// ── 文章 ──

const postPath = (rel: string) => `${POSTS_DIR}/${rel}`;

async function listPosts(): Promise<{ posts: PostSummary[] }> {
	const entries = await listDir(POSTS_DIR);
	const files: string[] = [];
	async function walk(dir: string, items: GhContent[], base: string) {
		for (const item of items) {
			if (item.type === "dir") {
				const sub = await listDir(`${dir}/${item.name}`);
				await walk(`${dir}/${item.name}`, sub, base ? `${base}/${item.name}` : item.name);
			} else if (/\.(md|mdx)$/i.test(item.name)) {
				const rel = base ? `${base}/${item.name}` : item.name;
				files.push(rel);
			}
		}
	}
	await walk(POSTS_DIR, entries, "");

	const posts: PostSummary[] = [];
	const batch = 8;
	for (let i = 0; i < files.length; i += batch) {
		const chunk = files.slice(i, i + batch);
		const results = await Promise.all(
			chunk.map(async (rel) => {
				try {
					const f = await getText(postPath(rel));
					if (!f) return null;
					const { data } = parseFrontmatter(f.content);
					return {
						file: rel,
						slug: String(data.slug ?? rel.replace(/\.(md|mdx)$/i, "")),
						title: String(data.title ?? "(无标题)"),
						published: formatDate(data.published),
						updated: formatDate(data.updated ?? ""),
						description: String(data.description ?? ""),
						image: await localizeUrl(String(data.image ?? "")),
						tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
						category: String(data.category ?? ""),
						draft: Boolean(data.draft),
						pinned: Boolean(data.pinned),
						series: String(data.series ?? ""),
						seriesOrder: typeof data.seriesOrder === "number" ? data.seriesOrder : undefined,
						hasPassword: Boolean(data.password),
					} satisfies PostSummary;
				} catch {
					return null; /* 跳过解析失败的文件 */
				}
			})
		);
		for (const p of results) if (p) posts.push(p);
	}
	posts.sort((a, b) => {
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		return b.published.localeCompare(a.published);
	});
	return { posts };
}

async function getPost(rel: string): Promise<PostDetail> {
	const f = await getText(postPath(rel));
	if (!f) throw new Error("文章不存在");
	const { data, body } = parseFrontmatter(f.content);
	return { file: rel, data, body: await localizeRemoteImages(body) };
}

/** 依据模板顺序构建 frontmatter 条目（已知键在前，未知键保持原顺序在后）——与 server 端一致 */
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

interface PostInput {
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

async function createPost(input: PostInput): Promise<{ file: string }> {
	const title = (input.title || "").trim();
	if (!title) throw new Error("标题不能为空");
	const slug = (input.slug || (await slugify(title))).trim();
	if (!slug || /[\\/]/.test(slug)) throw new Error("slug 非法（不能包含路径分隔符）");
	const rel = `${slug}.md`;
	if (await getText(postPath(rel))) throw new Error(`文章已存在: ${slug}.md`);

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
	await putFile(postPath(rel), renderPostFile(entries, input.body || ""), null, commitMessage("feat: 新增文章"));
	return { file: rel };
}

async function updatePost(rel: string, input: PostInput): Promise<{ file: string }> {
	const f = await getText(postPath(rel));
	if (!f) throw new Error("文章不存在");
	const { data: existing, body: existingBody } = parseFrontmatter(f.content);

	// 合并：现有 frontmatter 为底，表单值覆盖
	const merged: Record<string, unknown> = { ...existing };
	const formKeys = [
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
	] as const;
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
	if (!newSlug || /[\\/]/.test(newSlug)) throw new Error("slug 非法");
	merged.slug = newSlug;
	const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
	const newRel = dir ? `${dir}/${newSlug}.md` : `${newSlug}.md`;

	if (newRel !== rel) {
		if (await getText(postPath(newRel))) throw new Error(`目标文件已存在: ${newSlug}.md`);
		await putFile(postPath(newRel), renderPostFile(buildPostEntries(merged), input.body ?? existingBody), null, commitMessage("feat: 更新文章"));
		await deleteFile(postPath(rel), f.sha, commitMessage("feat: 更新文章"));
		return { file: newRel };
	}
	await putFile(postPath(rel), renderPostFile(buildPostEntries(merged), input.body ?? existingBody), f.sha, commitMessage("feat: 更新文章"));
	return { file: rel };
}

async function removePost(rel: string): Promise<{ ok: boolean }> {
	const f = await getText(postPath(rel));
	if (!f) throw new Error("文章不存在");
	await deleteFile(postPath(rel), f.sha, commitMessage("chore: 删除文章"));
	return { ok: true };
}

// ── 动态（FireFly markdown 形态）──

/** "2026-07-15 16:15:29" → 动态文件名 "2026-07-15-161529.md" */
function fileNameFromPublished(published: string): string {
	const m = published.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
	if (!m) throw new Error(`时间格式应为 YYYY-MM-DD HH:mm:ss，收到: ${published}`);
	return `${m[1]}-${m[2]}${m[3]}${m[4]}.md`;
}

function buildDynamicEntries(published: string, pinned: boolean, location: string): Record<string, FmValue> {
	const entries: Record<string, FmValue> = {
		published: { type: "datetime", value: published },
	};
	if (pinned) entries.pinned = true;
	if (location.trim()) entries.location = location.trim();
	return entries;
}

function renderDynamicFile(entries: Record<string, FmValue>, content: string): string {
	return `${serializeFrontmatter(entries)}\n\n${content.replace(/\s+$/, "")}\n`;
}

async function requireMarkdownDynamics(): Promise<void> {
	const caps = await detectCapabilities();
	if (caps.dynamics === "diaryTs") {
		throw new Error("GitHub 直连模式暂不支持 Mizuki 日记（src/data/diary.ts 结构化文件），请在电脑端管理动态");
	}
	if (caps.dynamics !== "markdown") {
		throw new Error(`该主题（${caps.theme}）没有基于 markdown 的动态功能`);
	}
}

async function listDynamics(): Promise<{ dynamics: DynamicItem[] }> {
	await requireMarkdownDynamics();
	const entries = await listDir(DYNAMIC_DIR);
	const names = entries.filter((e) => e.type === "file" && e.name.endsWith(".md")).map((e) => e.name);
	const items: DynamicItem[] = [];
	const batch = 8;
	for (let i = 0; i < names.length; i += batch) {
		const results = await Promise.all(
			names.slice(i, i + batch).map(async (name) => {
				try {
					const f = await getText(`${DYNAMIC_DIR}/${name}`);
					if (!f) return null;
					const { data, body } = parseFrontmatter(f.content);
				return {
					file: name,
					published: formatDateTime(data.published),
					pinned: Boolean(data.pinned),
					location: String(data.location ?? ""),
					content: await localizeRemoteImages(body),
				} satisfies DynamicItem;
				} catch {
					return null;
				}
			})
		);
		for (const d of results) if (d) items.push(d);
	}
	items.sort((a, b) => b.published.localeCompare(a.published));
	return { dynamics: items };
}

async function createDynamic(input: { content: string; published?: string; pinned?: boolean; location?: string }): Promise<{ file: string }> {
	await requireMarkdownDynamics();
	const content = (input.content || "").trim();
	if (!content) throw new Error("动态内容不能为空");
	const published = input.published?.trim() || nowInZone(await blogTimezone());
	let bump = published;
	let name = fileNameFromPublished(bump);
	for (let attempt = 0; attempt < 120 && (await getText(`${DYNAMIC_DIR}/${name}`)); attempt++) {
		// 文件名冲突：秒数 +1 重试
		const d = new Date(bump.replace(" ", "T"));
		d.setSeconds(d.getSeconds() + 1);
		bump = formatDateTime(d);
		name = fileNameFromPublished(bump);
	}
	await putFile(
		`${DYNAMIC_DIR}/${name}`,
		renderDynamicFile(buildDynamicEntries(bump, Boolean(input.pinned), input.location || ""), content),
		null,
		commitMessage("feat: 更新动态")
	);
	return { file: name };
}

async function updateDynamic(rel: string, input: { content?: string; published?: string; pinned?: boolean; location?: string }): Promise<{ file: string }> {
	await requireMarkdownDynamics();
	const f = await getText(`${DYNAMIC_DIR}/${rel}`);
	if (!f) throw new Error("动态不存在");
	const { data, body } = parseFrontmatter(f.content);
	const existing = {
		published: formatDateTime(data.published),
		pinned: Boolean(data.pinned),
		location: String(data.location ?? ""),
		content: body,
	};
	const published = input.published?.trim() || existing.published;
	const pinned = input.pinned ?? existing.pinned;
	const location = input.location ?? existing.location;
	const content = input.content ?? existing.content;

	const newName = fileNameFromPublished(published);
	if (newName !== rel && (await getText(`${DYNAMIC_DIR}/${newName}`))) throw new Error(`目标文件已存在: ${newName}`);
	await putFile(
		`${DYNAMIC_DIR}/${newName}`,
		renderDynamicFile(buildDynamicEntries(published, pinned, location), content),
		newName !== rel ? null : f.sha,
		commitMessage("feat: 更新动态")
	);
	if (newName !== rel) await deleteFile(`${DYNAMIC_DIR}/${rel}`, f.sha, commitMessage("feat: 更新动态"));
	return { file: newName };
}

async function removeDynamic(rel: string): Promise<{ ok: boolean }> {
	await requireMarkdownDynamics();
	const f = await getText(`${DYNAMIC_DIR}/${rel}`);
	if (!f) throw new Error("动态不存在");
	await deleteFile(`${DYNAMIC_DIR}/${rel}`, f.sha, commitMessage("chore: 删除动态"));
	return { ok: true };
}

// ── 页面（spec 单页）──

async function listPages(): Promise<{ pages: SpecPage[] }> {
	const entries = await listDir(SPEC_DIR);
	return {
		pages: entries
			.filter((e) => e.type === "file" && /\.(md|mdx)$/i.test(e.name))
			.map((e) => ({ file: e.name, name: e.name.replace(/\.(md|mdx)$/i, ""), ext: e.name.split(".").pop() ?? "md" }))
			.sort((a, b) => a.file.localeCompare(b.file)),
	};
}

async function getPage(rel: string): Promise<{ file: string; content: string }> {
	const f = await getText(`${SPEC_DIR}/${rel}`);
	if (!f) throw new Error("页面不存在");
	return { file: rel, content: await localizeRemoteImages(f.content) };
}

async function savePage(rel: string, content: string): Promise<{ ok: boolean }> {
	if (typeof content !== "string" || !rel) throw new Error("内容不能为空");
	const f = await getText(`${SPEC_DIR}/${rel}`);
	if (!f) throw new Error("页面不存在（不支持新建页面，请在电脑端创建）");
	await putFile(`${SPEC_DIR}/${rel}`, content, f.sha, commitMessage("chore: 更新页面"));
	return { ok: true };
}

// ── 站点配置（AST 引擎直连版，与 server/config/routes.ts 行为一致）──

/** 配置文件名 → 仓库路径（data/ 前缀 = Mizuki 数据文件；单文件布局 = src/config.ts） */
function configRepoPath(file: string): string {
	const m = file.match(/^(data\/)?([A-Za-z0-9_-]+\.tsx?)$/);
	if (!m) throw new Error("非法配置文件名");
	if (m[1]) return `src/data/${m[2]}`;
	return cachedCaps?.configLayout === "single" ? "src/config.ts" : `src/config/${file}`;
}

function segmentsOf(dotPath: string): PathSegment[] {
	return dotPath.split(".").map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

function cleanFieldValue(field: { type: string; optional?: boolean }, value: unknown): unknown {
	if (value === undefined || value === null) return undefined;
	if (field.optional && typeof value === "string" && value.trim() === "") return null;
	if (field.optional && Array.isArray(value) && value.length === 0) return null;
	return value;
}

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

async function configEntries(): Promise<{ theme: string; configLayout: string | null; entries: ConfigEntry[] }> {
	const caps = await detectCapabilities();
	return { theme: caps.theme, configLayout: caps.configLayout, entries: getConfigRegistry(caps.theme, caps.configLayout) };
}

async function configGet(file: string): Promise<{ file: string; exportName: string; title: string; fields: FieldSpec[] }> {
	const caps = await detectCapabilities();
	const entry = getConfigRegistry(caps.theme, caps.configLayout).find((e) => e.file === file);
	if (!entry) throw new Error("未注册的配置文件");
	const f = await getText(configRepoPath(file));
	if (!f) throw new Error("配置文件不存在");
	const { readPath } = await loadAst();
	const fields = entry.fields.map((field) => {
		const r = readPath(f.content, entry.exportName, segmentsOf(field.path));
		return { ...field, value: r.found ? (r.value ?? null) : null, readError: r.error ?? null, exists: r.found };
	});
	return { file: entry.file, exportName: entry.exportName, title: entry.title, fields };
}

async function configSaveFields(file: string, values: { path: string; value: unknown }[]): Promise<{ ok: boolean; applied: string[] }> {
	const caps = await detectCapabilities();
	const entry = getConfigRegistry(caps.theme, caps.configLayout).find((e) => e.file === file);
	if (!entry) throw new Error("未注册的配置文件");
	const repoPath = configRepoPath(file);
	const f = await getText(repoPath);
	if (!f) throw new Error("配置文件不存在");
	let code = f.content;
	const applied: string[] = [];
	const { writePath } = await loadAst();
	for (const { path: dotPath, value } of values) {
		const field = entry.fields.find((fl) => fl.path === dotPath);
		if (!field) throw new Error(`未注册的字段: ${dotPath}`);
		const v = prepareFieldValue(field, value);
		if (v === undefined || v === null) continue;
		code = writePath(code, entry.exportName, segmentsOf(dotPath), v);
		applied.push(dotPath);
	}
	await putFile(repoPath, code, f.sha, commitMessage("chore: 更新站点配置"));
	return { ok: true, applied };
}

async function configRawList(): Promise<{ files: { file: string; size: number; mtime: number }[] }> {
	const caps = await detectCapabilities();
	const toFile = (e: GhContent, prefix = "") => ({ file: `${prefix}${e.name}`, size: e.size, mtime: 0 });
	let files: { file: string; size: number; mtime: number }[] = [];
	if (caps.configLayout === "single" && (caps.theme === "mizuki" || caps.theme === "fuwari")) {
		const entries = await listDir("src");
		files = entries.filter((e) => e.type === "file" && /\.(tsx?)$/.test(e.name) && !/\.d\.tsx?$/.test(e.name)).map((e) => toFile(e));
	} else {
		const entries = await listDir("src/config");
		files = entries.filter((e) => e.type === "file" && /\.(tsx?)$/.test(e.name)).map((e) => toFile(e));
	}
	if (caps.theme === "mizuki") {
		const dataEntries = await listDir("src/data");
		files.push(...dataEntries.filter((e) => e.type === "file" && /\.(tsx?)$/.test(e.name)).map((e) => toFile(e, "data/")));
	}
	files.sort((a, b) => a.file.localeCompare(b.file));
	return { files };
}

async function configRawGet(file: string): Promise<{ file: string; content: string }> {
	const f = await getText(configRepoPath(file));
	if (!f) throw new Error("配置文件不存在");
	return { file, content: f.content };
}

async function configRawSave(file: string, content: string): Promise<{ ok: boolean }> {
	const repoPath = configRepoPath(file);
	const f = await getText(repoPath);
	if (!f) throw new Error("配置文件不存在（不支持新建）");
	await putFile(repoPath, content, f.sha, commitMessage("chore: 更新配置源码"));
	return { ok: true };
}

// ── Mizuki 日记（src/data/diary.ts 数组直连读写）──

const DIARY_PATH = "src/data/diary.ts";

async function loadDiary(): Promise<{ sha: string; text: string; entries: Record<string, unknown>[] }> {
	const f = await getText(DIARY_PATH);
	if (!f) throw new Error("未找到 src/data/diary.ts");
	const { readTopLevelArray } = await loadAst();
	const r = readTopLevelArray(f.content, "diaryData");
	if (!r.found || !Array.isArray(r.value)) throw new Error(r.error || "diary.ts 中的 diaryData 无法解析");
	return { sha: f.sha, text: f.content, entries: r.value.filter((e) => e && typeof e === "object") as Record<string, unknown>[] };
}

async function saveDiary(sha: string, entries: Record<string, unknown>[], text: string, message: string): Promise<void> {
	const { writeTopLevelArray } = await loadAst();
	const code = writeTopLevelArray(text, "diaryData", entries);
	await putFile(DIARY_PATH, code, sha, message);
}

/** diary date（"2025-01-15T10:30:00Z" 等）→ "YYYY-MM-DD HH:mm:ss" */
function diaryDateToPublished(date: unknown): string {
	const s = String(date ?? "");
	const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
	if (m) return `${m[1]} ${m[2]}`;
	const d = new Date(s);
	if (!Number.isNaN(d.getTime())) return formatDateTime(d);
	return s;
}

/** "YYYY-MM-DD HH:mm:ss" → diary date（T 分隔） */
function publishedToDiaryDate(published: string): string {
	const m = published.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
	if (!m) throw new Error(`时间格式应为 YYYY-MM-DD HH:mm:ss，收到: ${published}`);
	return `${m[1]}T${m[2]}`;
}

async function diaryList(): Promise<{ dynamics: DynamicItem[] }> {
	const { entries } = await loadDiary();
	return {
		dynamics: entries
			.map((e) => ({
				file: `diary:${e.id}`,
				published: diaryDateToPublished(e.date),
				pinned: false,
				location: String(e.location ?? ""),
				content: String(e.content ?? ""),
			}))
			.sort((a, b) => b.published.localeCompare(a.published)),
	};
}

async function diaryCreate(input: { content: string; published?: string; pinned?: boolean; location?: string }): Promise<{ file: string }> {
	const content = (input.content || "").trim();
	if (!content) throw new Error("动态内容不能为空");
	const { sha, text, entries } = await loadDiary();
	const published = input.published?.trim() || nowInZone(await blogTimezone());
	const nextId = entries.reduce((max, e) => Math.max(max, Number(e.id) || 0), 0) + 1;
	const entry: Record<string, unknown> = { id: nextId, content, date: publishedToDiaryDate(published) };
	if (input.location?.trim()) entry.location = input.location.trim();
	entries.push(entry);
	await saveDiary(sha, entries, text, commitMessage("feat: 更新动态"));
	return { file: `diary:${nextId}` };
}

async function diaryUpdate(rel: string, input: { content?: string; published?: string; pinned?: boolean; location?: string }): Promise<{ file: string }> {
	const id = Number(rel.replace(/^diary:/, ""));
	const { sha, text, entries } = await loadDiary();
	const entry = entries.find((e) => Number(e.id) === id);
	if (!entry) throw new Error("日记不存在");
	if (input.content !== undefined) entry.content = input.content;
	if (input.published?.trim()) entry.date = publishedToDiaryDate(input.published.trim());
	if (input.location !== undefined) {
		if (input.location.trim()) entry.location = input.location.trim();
		else delete entry.location;
	}
	await saveDiary(sha, entries, text, commitMessage("feat: 更新动态"));
	return { file: rel };
}

async function diaryRemove(rel: string): Promise<{ ok: boolean }> {
	const id = Number(rel.replace(/^diary:/, ""));
	const { sha, text, entries } = await loadDiary();
	const kept = entries.filter((e) => Number(e.id) !== id);
	if (kept.length === entries.length) throw new Error("日记不存在");
	await saveDiary(sha, kept, text, commitMessage("chore: 删除动态"));
	return { ok: true };
}

/** 动态存储形态分发：FireFly markdown / Mizuki diaryTs */
async function requireDynamicsKind(): Promise<"markdown" | "diaryTs"> {
	const caps = await detectCapabilities();
	if (caps.dynamics === "diaryTs") return "diaryTs";
	if (caps.dynamics !== "markdown") throw new Error(`该主题（${caps.theme}）没有动态功能`);
	return "markdown";
}

async function dynList(): Promise<{ dynamics: DynamicItem[] }> {
	return (await requireDynamicsKind()) === "diaryTs" ? diaryList() : listDynamics();
}

async function dynCreate(input: { content: string; published?: string; pinned?: boolean; location?: string }): Promise<{ file: string }> {
	return (await requireDynamicsKind()) === "diaryTs" ? diaryCreate(input) : createDynamic(input);
}

async function dynUpdate(rel: string, input: { content?: string; published?: string; pinned?: boolean; location?: string }): Promise<{ file: string }> {
	if (rel.startsWith("diary:")) return diaryUpdate(rel, input);
	return (await requireDynamicsKind()) === "diaryTs" ? diaryUpdate(rel, input) : updateDynamic(rel, input);
}

async function dynRemove(rel: string): Promise<{ ok: boolean }> {
	if (rel.startsWith("diary:")) return diaryRemove(rel);
	return (await requireDynamicsKind()) === "diaryTs" ? diaryRemove(rel) : removeDynamic(rel);
}

// ── 仪表盘（GitHub 版 overview）──

interface GhCommitItem {
	sha: string;
	commit: { message: string; author: { name?: string; date?: string } | null };
}

async function gitLog(): Promise<{ commits: GitCommit[] }> {
	if (useSeed()) return { commits: [] };
	const cfg = ghConfig.value;
	const items = await ghApi<GhCommitItem[]>("GET", `/repos/${cfg.owner}/${cfg.repo}/commits?per_page=15`);
	return {
		commits: items.map((it) => ({
			hash: it.sha.slice(0, 7),
			author: it.commit.author?.name ?? "",
			date: it.commit.author?.date ?? "",
			message: it.commit.message.split("\n")[0],
		})),
	};
}

async function overview() {
	const caps = await detectCapabilities();
	const cfg = ghConfig.value;
	const repo = useSeed()
		? { full_name: `${ghConfig.value.owner}/${ghConfig.value.repo}`, default_branch: ghConfig.value.branch }
		: await ghApi<{ full_name: string; default_branch: string }>("GET", `/repos/${cfg.owner}/${cfg.repo}`);
	const postFiles = await countMarkdownFiles(POSTS_DIR);
	const dynCount =
		caps.dynamics === "markdown"
			? (await listDir(DYNAMIC_DIR)).filter((e) => e.type === "file" && e.name.endsWith(".md")).length
			: caps.dynamics === "diaryTs"
				? // 轻量计数：正则统计 diary 条目数，避免为仪表盘加载 AST 引擎
				((await getText(DIARY_PATH).catch(() => null))?.content.match(/\bid\s*:/g)?.length ?? 0)
				: 0;
	// 相册/壁纸计数：目录级统计（FireFly 相册=public/gallery 子目录；Mizuki=albums 子目录）
	const albums = caps.gallery === null ? 0 : await countDirsIn(caps.gallery === "scanner" ? "public/images/albums" : "public/gallery");
	const mizuki = caps.theme === "mizuki";
	const desktopWallpapers = await countImagesIn(
		mizuki ? (caps.configLayout === "single" ? "public/images" : "public/assets/desktop-banner") : "src/assets/images/DesktopWallpaper"
	);
	const mobileWallpapers = await countImagesIn(
		mizuki ? (caps.configLayout === "single" ? "public/images" : "public/assets/mobile-banner") : "src/assets/images/MobileWallpaper"
	);
	let commits: GitCommit[] = [];
	try {
		commits = (await gitLog()).commits;
	} catch {
		/* 提交历史获取失败不阻塞仪表盘 */
	}
	return {
		project: { id: "github", name: repo.full_name, localPath: "", remoteUrl: `https://github.com/${repo.full_name}`, branch: cfg.branch },
		theme: caps.theme,
		counts: { posts: postFiles, dynamics: dynCount, albums, desktopWallpapers, mobileWallpapers },
		git: { branch: cfg.branch, changed: 0, ahead: 0, behind: 0 },
		dev: { running: false, cwd: null, logs: [], url: "" },
		commits,
	};
}

/** 统计目录下（含子目录）的 md/mdx 文件数 */
async function countMarkdownFiles(dir: string, base = ""): Promise<number> {
	let count = 0;
	for (const item of await listDir(dir)) {
		if (item.type === "dir") {
			count += await countMarkdownFiles(`${dir}/${item.name}`, `${base}${item.name}/`);
		} else if (/\.(md|mdx)$/i.test(item.name)) {
			count += 1;
		}
	}
	return count;
}

async function countDirsIn(dir: string): Promise<number> {
	try {
		return (await listDir(dir)).filter((e) => e.type === "dir").length;
	} catch {
		return 0;
	}
}

async function countImagesIn(dir: string): Promise<number> {
	try {
		return (await listDir(dir)).filter((e) => e.type === "file" && IMAGE_EXTS.test(e.name)).length;
	} catch {
		return 0;
	}
}

// ── 相册（GitHub 直连版；FireFly = src/config/galleryConfig.ts + public/gallery，Mizuki = public/images/albums 扫描式）──

const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|svg|avif|bmp|tiff?)$/i;
const ALBUM_OPTIONAL = ["password", "passwordHint"];

function bytesToB64(bytes: Uint8Array): string {
	let bin = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(bin);
}

/** 带令牌拉取仓库文件为 Blob——解决私有仓库 <img> 无法鉴权显示图片的问题 */
async function ghBlob(path: string): Promise<Blob> {
	if (useSeed()) {
		const resolved = await seedResolve(path);
		if (!resolved) throw new Error("内置模板快照未包含该图片文件");
		const res = await fetch(`/seed/${resolved}`);
		if (!res.ok) throw new Error("模板图片加载失败");
		return res.blob();
	}
	const cfg = ghConfig.value;
	const headers: Record<string, string> = { Accept: "application/vnd.github.raw" };
	if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
	const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`, { headers });
	if (!res.ok) throw await ghHttpError(res);
	return res.blob();
}

async function galleryRoot(): Promise<{ base: string; scanner: boolean }> {
	const caps = await detectCapabilities();
	return caps.gallery === "scanner"
		? { base: "public/images/albums", scanner: true }
		: { base: "public/gallery", scanner: false };
}

function albumDirOf(albumId: string): string {
	const id = String(albumId ?? "").trim();
	if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`相册 ID 非法: ${id}`);
	return id;
}

/** 列出目录内图片并并发拉取为本地 blob URL（与电脑端一致加载原图） */
async function listAlbumImagesFromDir(dir: string): Promise<{ images: GalleryImage[] }> {
	const entries = await listDir(dir);
	const imgs = entries
		.filter((e) => e.type === "file" && IMAGE_EXTS.test(e.name))
		.sort((a, b) => a.name.localeCompare(b.name));
	const results: GalleryImage[] = imgs.map((e) => ({ name: e.name, size: e.size, mtime: 0, url: "" }));
	let cursor = 0;
	const workers = Array.from({ length: Math.min(6, imgs.length) }, async () => {
		while (cursor < imgs.length) {
			const i = cursor++;
			try {
				results[i].url = URL.createObjectURL(await ghBlob(`${dir}/${imgs[i].name}`));
			} catch {
				results[i].url = "";
			}
		}
	});
	await Promise.all(workers);
	return { images: results };
}

function isCoverName(name: string): boolean {
	return /^cover\./i.test(name);
}

/** 读取 FireFly 相册 urls.txt（每行一个外链图片 URL，# 开头为注释） */
async function readGalleryUrls(dir: string): Promise<string[]> {
	const f = await getText(`${dir}/urls.txt`);
	if (!f) return [];
	return f.content
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => /^https?:\/\//i.test(line));
}

/** 外链照片在列表中显示的名称：取 URL 最后一段（解码后） */
function remoteImageName(url: string): string {
	try {
		const u = new URL(url);
		return decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "") || u.hostname;
	} catch {
		return url;
	}
}

/**
 * 相册图片列表：本地图片（cover.* 排第一，与主题一致）+ urls.txt 外链照片。
 * 上游 FireFly 模板相册的照片即来自 urls.txt 外链（目录内没有本地图片文件）。
 */
async function listGalleryImages(dir: string): Promise<{ images: GalleryImage[] }> {
	const { images } = await listAlbumImagesFromDir(dir);
	images.sort((a, b) => Number(isCoverName(b.name)) - Number(isCoverName(a.name)));
	const remote = await Promise.all(
		(await readGalleryUrls(dir)).map<Promise<GalleryImage>>(async (url) => ({
			name: remoteImageName(url),
			size: 0,
			mtime: 0,
			url: await localizeUrl(url),
			remote: true,
		}))
	);
	return { images: [...images, ...remote] };
}

async function readMizukiInfoJson(dir: string): Promise<Record<string, unknown>> {
	const f = await getText(`${dir}/info.json`);
	if (!f) return {};
	try {
		return JSON.parse(f.content) as Record<string, unknown>;
	} catch {
		return {};
	}
}

function setOrDelete(info: Record<string, unknown>, key: string, value: unknown): void {
	if (String(value ?? "").trim()) info[key] = String(value);
	else delete info[key];
}

async function upsertMizukiAlbum(input: Record<string, unknown>): Promise<void> {
	const id = albumDirOf(String(input.id ?? ""));
	const dir = `public/images/albums/${id}`;
	const info = await readMizukiInfoJson(dir);
	info.title = String(input.name ?? id);
	setOrDelete(info, "description", input.description);
	setOrDelete(info, "location", input.location);
	setOrDelete(info, "date", input.date);
	if (Array.isArray(input.tags) && input.tags.length > 0) info.tags = input.tags.map(String);
	else delete info.tags;
	setOrDelete(info, "password", input.password);
	setOrDelete(info, "passwordHint", input.passwordHint);
	const existing = await getText(`${dir}/info.json`);
	await putFile(`${dir}/info.json`, `${JSON.stringify(info, null, "\t")}\n`, existing?.sha ?? null, commitMessage("chore: 更新相册"));
}

async function galleryGet(): Promise<{ theme: string; albums: Record<string, unknown>[]; columnWidth: number | null }> {
	const caps = await detectCapabilities();
	if (caps.gallery === null) return { theme: caps.theme, albums: [], columnWidth: null };
	if (caps.gallery === "scanner") {
		const root = "public/images/albums";
		const albums: Record<string, unknown>[] = [];
		for (const d of (await listDir(root)).filter((e) => e.type === "dir")) {
			const dir = `${root}/${d.name}`;
			const info = await readMizukiInfoJson(dir);
			const photos = (await listDir(dir)).filter((e) => e.type === "file" && IMAGE_EXTS.test(e.name) && !/^cover\./i.test(e.name));
			albums.push({
				id: d.name,
				name: String(info.title ?? d.name),
				description: String(info.description ?? ""),
				location: String(info.location ?? ""),
				date: String(info.date ?? ""),
				tags: Array.isArray(info.tags) ? info.tags.map(String) : [],
				password: String(info.password ?? ""),
				passwordHint: String(info.passwordHint ?? ""),
				hidden: info.hidden === true,
				photoCount: photos.length,
			});
		}
		albums.sort((a, b) => String(a.id).localeCompare(String(b.id)));
		return { theme: caps.theme, albums, columnWidth: null };
	}
	const f = await getText("src/config/galleryConfig.ts");
	if (!f) return { theme: caps.theme, albums: [], columnWidth: null };
	const { readPath } = await loadAst();
	const albums = readPath(f.content, "galleryConfig", ["albums"]);
	const columnWidth = readPath(f.content, "galleryConfig", ["columnWidth"]);
	return {
		theme: caps.theme,
		albums: albums.found && Array.isArray(albums.value) ? (albums.value as Record<string, unknown>[]) : [],
		columnWidth: typeof columnWidth.value === "number" ? columnWidth.value : 240,
	};
}

async function gallerySave(albums: Record<string, unknown>[], columnWidth?: number | null): Promise<{ ok: boolean }> {
	const caps = await detectCapabilities();
	if (caps.gallery === null) throw new Error(`该主题（${caps.theme}）没有相册功能`);
	const ids = albums.map((a) => String(a.id ?? "").trim());
	if (ids.some((id) => !/^[A-Za-z0-9_-]+$/.test(id))) throw new Error("相册 ID 只能包含字母、数字、- 和 _");
	if (new Set(ids).size !== ids.length) throw new Error("相册 ID 重复");
	if (caps.gallery === "scanner") {
		// Mizuki：只增改（目录即相册，删除走显式 DELETE，避免保存时误删手工相册）
		for (const album of albums) await upsertMizukiAlbum(album);
		return { ok: true };
	}
	// FireFly：可选字段为空时置 null（AST 引擎视为删除该键）
	const cleaned = albums.map((a) => {
		const out: Record<string, unknown> = { ...a };
		for (const key of ALBUM_OPTIONAL) {
			if (!String(out[key] ?? "").trim()) out[key] = null;
		}
		return out;
	});
	const repoPath = "src/config/galleryConfig.ts";
	const f = await getText(repoPath);
	if (!f) throw new Error("未找到 src/config/galleryConfig.ts");
	const { writePath } = await loadAst();
	let code = f.content;
	code = writePath(code, "galleryConfig", ["albums"], cleaned);
	if (typeof columnWidth === "number") code = writePath(code, "galleryConfig", ["columnWidth"], columnWidth);
	await putFile(repoPath, code, f.sha, commitMessage("chore: 更新相册配置"));
	return { ok: true };
}

async function galleryRemove(albumId: string): Promise<{ ok: boolean }> {
	const caps = await detectCapabilities();
	if (caps.gallery === null) throw new Error(`该主题（${caps.theme}）没有相册功能`);
	if (caps.gallery !== "scanner") throw new Error("FireFly 相册请在列表中移除后保存");
	const dir = `public/images/albums/${albumDirOf(albumId)}`;
	const entries = await listDir(dir);
	if (!entries.length) throw new Error("相册目录不存在");
	for (const e of entries.filter((x) => x.type === "file")) {
		await deleteFile(`${dir}/${e.name}`, e.sha, commitMessage("chore: 删除相册"));
	}
	return { ok: true };
}

async function gallerySetCover(albumId: string, name: string): Promise<{ cover: string }> {
	const caps = await detectCapabilities();
	const dir = `public/images/albums/${albumDirOf(albumId)}`;
	const entries = await listDir(dir);
	const srcEntry = entries.find((x) => x.type === "file" && x.name === name);
	if (!srcEntry) throw new Error("文件不存在");
	// 移除现有 cover.*
	for (const e of entries.filter((x) => x.type === "file" && /^cover\./i.test(x.name))) {
		await deleteFile(`${dir}/${e.name}`, e.sha, commitMessage("chore: 更新相册封面"));
	}
	const ext = (name.match(/\.[^.]+$/) ?? [""])[0].toLowerCase();
	const mizuki = caps.gallery === "scanner";
	if (mizuki && ext !== ".webp" && ext !== ".jpg") {
		throw new Error("Mizuki 相册封面只支持 webp/jpg（其他格式请在电脑端转换后再设为封面）");
	}
	// 无 sharp：复制原文件为封面并删除原文件（等效电脑端的 rename）
	const blob = await ghBlob(srcEntry.path);
	const dest = `cover${ext}`;
	await putFileB64(`${dir}/${dest}`, bytesToB64(new Uint8Array(await blob.arrayBuffer())), null, commitMessage("chore: 更新相册封面"));
	await deleteFile(`${dir}/${name}`, srcEntry.sha, commitMessage("chore: 更新相册封面"));
	return { cover: dest };
}

/**
 * 相册列表缩略图与照片数：列表页直接展示每个相册的封面，无需逐个打开相册。
 * 封面优先级与主题一致（手动指定 cover 字段 > cover.* 文件 > 第一张照片）；
 * FireFly 相册的照片可全部来自 urls.txt 外链（上游模板相册即如此），此时取第一个外链作封面兜底。
 */
async function galleryCovers(albums?: Record<string, unknown>[]): Promise<{ covers: Record<string, string>; counts: Record<string, number> }> {
	const caps = await detectCapabilities();
	if (caps.gallery === null) return { covers: {}, counts: {} };
	const base = (await galleryRoot()).base;
	let list = albums;
	if (caps.gallery === "config" && !list) {
		const f = await getText("src/config/galleryConfig.ts");
		if (!f) return { covers: {}, counts: {} };
		const { readPath } = await loadAst();
		const r = readPath(f.content, "galleryConfig", ["albums"]);
		list = r.found && Array.isArray(r.value) ? (r.value as Record<string, unknown>[]) : [];
	}
	const ids = (list ?? []).map((a) => String(a.id ?? "").trim()).filter((id) => /^[A-Za-z0-9_-]+$/.test(id));
	const covers: Record<string, string> = {};
	const counts: Record<string, number> = {};
	let cursor = 0;
	await Promise.all(
		Array.from({ length: Math.min(4, ids.length) }, async () => {
			while (cursor < ids.length) {
				const id = ids[cursor++];
				try {
					const dir = `${base}/${id}`;
					const local = (await listDir(dir)).filter((e) => e.type === "file" && IMAGE_EXTS.test(e.name));
					if (caps.gallery === "scanner") {
						// Mizuki：封面 = cover.* > 第一张图（照片数已由 galleryGet 提供并含 photoCount，不重复统计）
						const cover = local.find((e) => isCoverName(e.name)) ?? local[0];
						if (cover) covers[id] = URL.createObjectURL(await ghBlob(cover.path));
						continue;
					}
					const remoteUrls = await readGalleryUrls(dir);
					counts[id] = local.length + remoteUrls.length;
					const coverField = String((list ?? []).find((a) => String(a.id ?? "").trim() === id)?.cover ?? "").trim();
					let cover = "";
					if (/^(https?:)?\/\//i.test(coverField)) {
						cover = /^\/\//i.test(coverField) ? `https:${coverField}` : coverField;
					} else if (coverField) {
						// 仓库内路径：站点根路径映射到 public/；否则相对相册目录
						const norm = coverField.replace(/^\/+/, "");
						const candidates = norm.startsWith("public/") ? [norm] : [`public/${norm}`, `public/gallery/${id}/${norm}`];
						for (const p of candidates) {
							try {
								cover = URL.createObjectURL(await ghBlob(p));
								break;
							} catch {
								/* 尝试下一个候选路径 */
							}
						}
					}
					if (!cover) {
						const coverFile = local.find((e) => isCoverName(e.name)) ?? local[0];
						if (coverFile) cover = URL.createObjectURL(await ghBlob(coverFile.path));
					}
					if (!cover && remoteUrls.length) cover = await localizeUrl(remoteUrls[0]);
					if (cover) covers[id] = cover;
				} catch {
					/* 单个相册失败不阻塞其余相册 */
				}
			}
		})
	);
	return { covers, counts };
}

// ── 图片目标目录（相册/文章配图/壁纸）──

async function ghImageDir(target: string, albumId?: string): Promise<string> {
	if (target === "post-images") return POST_IMAGES_DIR;
	if (target === "gallery") return `${(await galleryRoot()).base}/${albumDirOf(albumId ?? "")}`;
	if (target === "wallpaper-desktop" || target === "wallpaper-mobile") {
		const caps = await detectCapabilities();
		if (caps.theme === "mizuki") {
			if (caps.configLayout === "single") return "public/images";
			return target === "wallpaper-desktop" ? "public/assets/desktop-banner" : "public/assets/mobile-banner";
		}
		return target === "wallpaper-desktop" ? "src/assets/images/DesktopWallpaper" : "src/assets/images/MobileWallpaper";
	}
	throw new Error("该目标目录暂不支持直连模式");
}

async function ghImageList(target: string, albumId?: string): Promise<{ images: GalleryImage[] }> {
	const dir = await ghImageDir(target, albumId);
	return target === "gallery" ? listGalleryImages(dir) : listAlbumImagesFromDir(dir);
}

async function ghImageDelete(target: string, name: string, albumId?: string): Promise<{ ok: boolean }> {
	const dir = await ghImageDir(target, albumId);
	const entries = await listDir(dir);
	const e = entries.find((x) => x.type === "file" && x.name === name);
	if (!e) throw new Error("图片不存在");
	await deleteFile(`${dir}/${name}`, e.sha, commitMessage("chore: 删除图片"));
	return { ok: true };
}

async function ghUploadImages(target: string, files: File[], albumId?: string): Promise<{ saved: string[] }> {
	const dir = await ghImageDir(target, albumId);
	const existing = new Set((await listDir(dir)).filter((e) => e.type === "file").map((e) => e.name));
	const saved: string[] = [];
	for (const file of files) {
		let name = file.name;
		if (existing.has(name)) name = `${Date.now()}-${file.name}`;
		await putFileB64(`${dir}/${name}`, await fileToB64(file), null, commitMessage("chore: 上传图片"));
		existing.add(name);
		saved.push(name);
	}
	return { saved };
}

// ── 对外接口（与 serverApi 同形）──

export const githubApi = {
	posts: {
		list: listPosts,
		detail: getPost,
		create: createPost,
		update: updatePost,
		remove: removePost,
	},
	dynamics: {
		list: dynList,
		create: dynCreate,
		update: dynUpdate,
		remove: dynRemove,
	},
	pages: {
		list: listPages,
		detail: getPage,
		save: savePage,
	},
	configs: {
		entries: configEntries,
		get: configGet,
		saveFields: configSaveFields,
		rawList: configRawList,
		rawGet: configRawGet,
		rawSave: configRawSave,
	},
	gallery: {
		get: galleryGet,
		save: gallerySave,
		remove: galleryRemove,
		images: (albumId: string) => ghImageList("gallery", albumId),
		setCover: gallerySetCover,
		covers: galleryCovers,
	},
	images: {
		list: ghImageList,
		remove: ghImageDelete,
	},
	theme: {
		get: detectCapabilities,
	},
	media: {
		/** 带令牌拉取仓库文件为 Blob（供壁纸/相册预览显示） */
		blob: ghBlob,
		/** 图片目标目录映射 */
		dir: ghImageDir,
	},
	overview,
	git: {
		log: gitLog,
	},
	uploads: {
		images: ghUploadImages,
	},
};
