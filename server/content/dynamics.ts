import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, serializeFrontmatter, formatDateTime, nowInZone, type FmValue } from "./frontmatter.js";
import { getBlogTimezone } from "./posts.js";
import { activeDirs, ensureInside } from "../paths.js";
import { activeCapabilities } from "../theme.js";
import { readTopLevelArray, writeTopLevelArray } from "../config/ast.js";

function dynamicDir(): string {
	return activeDirs().dynamicDir;
}

/** "2026-07-15 16:15:29" → 动态文件名 "2026-07-15-161529.md"（与 new-dynamic.js 一致） */
function fileNameFromPublished(published: string): string {
	const m = published.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
	if (!m) throw new Error(`时间格式应为 YYYY-MM-DD HH:mm:ss，收到: ${published}`);
	return `${m[1]}-${m[2]}${m[3]}${m[4]}.md`;
}

export interface DynamicItem {
	file: string;
	published: string;
	pinned: boolean;
	location: string;
	content: string;
}

// ── FireFly：src/content/dynamic/*.md ──

function listMarkdownDynamics(): DynamicItem[] {
	const dir = dynamicDir();
	if (!fs.existsSync(dir)) return [];
	const items: DynamicItem[] = [];
	for (const name of fs.readdirSync(dir)) {
		if (!name.endsWith(".md")) continue;
		try {
			const raw = fs.readFileSync(path.join(dir, name), "utf-8");
			const { data, body } = parseFrontmatter(raw);
			items.push({
				file: name,
				published: formatDateTime(data.published),
				pinned: Boolean(data.pinned),
				location: String(data.location ?? ""),
				content: body,
			});
		} catch {
			/* 跳过解析失败的文件 */
		}
	}
	items.sort((a, b) => b.published.localeCompare(a.published));
	return items;
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

function createMarkdownDynamic(input: {
	content: string;
	published?: string;
	pinned?: boolean;
	location?: string;
}): { file: string } {
	const content = (input.content || "").trim();
	if (!content) throw new Error("动态内容不能为空");
	const published = input.published?.trim() || nowInZone(getBlogTimezone());
	let file = path.join(dynamicDir(), fileNameFromPublished(published));
	let attempt = 0;
	let bump = published;
	while (fs.existsSync(file)) {
		// 文件名冲突：秒数 +1 重试
		const d = new Date(published.replace(" ", "T"));
		d.setSeconds(d.getSeconds() + 1);
		bump = formatDateTime(d);
		file = path.join(dynamicDir(), fileNameFromPublished(bump));
		if (++attempt > 120) throw new Error("无法生成唯一的动态文件名");
	}
	fs.mkdirSync(dynamicDir(), { recursive: true });
	fs.writeFileSync(file, renderDynamicFile(buildDynamicEntries(bump, Boolean(input.pinned), input.location || ""), content), "utf-8");
	return { file: path.basename(file) };
}

function resolveDynamicFile(rel: string): string {
	const file = ensureInside(dynamicDir(), path.join(dynamicDir(), rel));
	if (!file.endsWith(".md")) throw new Error("只支持 md 文件");
	if (!fs.existsSync(file)) throw new Error("动态不存在");
	return file;
}

function getMarkdownDynamic(rel: string): DynamicItem {
	const file = resolveDynamicFile(rel);
	const raw = fs.readFileSync(file, "utf-8");
	const { data, body } = parseFrontmatter(raw);
	return {
		file: rel,
		published: formatDateTime(data.published),
		pinned: Boolean(data.pinned),
		location: String(data.location ?? ""),
		content: body,
	};
}

function updateMarkdownDynamic(
	rel: string,
	input: { content?: string; published?: string; pinned?: boolean; location?: string }
): { file: string } {
	const oldFile = resolveDynamicFile(rel);
	const existing = getMarkdownDynamic(rel);
	const published = input.published?.trim() || existing.published;
	const pinned = input.pinned ?? existing.pinned;
	const location = input.location ?? existing.location;
	const content = input.content ?? existing.content;

	const newFileName = fileNameFromPublished(published);
	const targetFile = path.join(dynamicDir(), newFileName);
	if (newFileName !== rel && fs.existsSync(targetFile)) throw new Error(`目标文件已存在: ${newFileName}`);

	fs.writeFileSync(targetFile, renderDynamicFile(buildDynamicEntries(published, pinned, location), content), "utf-8");
	if (targetFile !== oldFile) fs.rmSync(oldFile);
	return { file: newFileName };
}

function deleteMarkdownDynamic(rel: string): void {
	fs.rmSync(resolveDynamicFile(rel));
}

// ── Mizuki：src/data/diary.ts 的 `const diaryData: DiaryItem[] = [...]` ──

const DIARY_CONST = "diaryData";

interface DiaryEntry {
	id: number;
	content: string;
	date: string;
	images?: string[];
	location?: string;
	mood?: string;
	tags?: string[];
}

function diaryFile(): string {
	return path.join(activeDirs().dataDir, "diary.ts");
}

function readDiaryEntries(): DiaryEntry[] {
	const file = diaryFile();
	if (!fs.existsSync(file)) return [];
	const code = fs.readFileSync(file, "utf-8");
	const r = readTopLevelArray(code, DIARY_CONST);
	if (!r.found || !Array.isArray(r.value)) {
		throw new Error(r.error || `diary.ts 中的 ${DIARY_CONST} 无法解析`);
	}
	return r.value.filter((e) => e && typeof e === "object") as DiaryEntry[];
}

function writeDiaryEntries(entries: DiaryEntry[]): void {
	const file = diaryFile();
	let code = fs.readFileSync(file, "utf-8");
	code = writeTopLevelArray(code, DIARY_CONST, entries as unknown[]);
	fs.writeFileSync(file, code, "utf-8");
}

/** diary date（"2025-01-15T10:30:00Z" 等）→ 显示用 "YYYY-MM-DD HH:mm:ss" */
function diaryDateToPublished(date: string): string {
	const m = String(date).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
	if (m) return `${m[1]} ${m[2]}`;
	const d = new Date(String(date));
	if (!Number.isNaN(d.getTime())) return formatDateTime(d);
	return String(date);
}

/** "YYYY-MM-DD HH:mm:ss" → diary date（本地时间 T 分隔，站点时区语义由展示端决定） */
function publishedToDiaryDate(published: string): string {
	const m = published.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
	if (!m) throw new Error(`时间格式应为 YYYY-MM-DD HH:mm:ss，收到: ${published}`);
	return `${m[1]}T${m[2]}`;
}

function listDiaryDynamics(): DynamicItem[] {
	return readDiaryEntries()
		.map((e) => ({
			file: `diary:${e.id}`,
			published: diaryDateToPublished(e.date),
			pinned: false,
			location: String(e.location ?? ""),
			content: String(e.content ?? ""),
		}))
		.sort((a, b) => b.published.localeCompare(a.published));
}

function createDiaryDynamic(input: {
	content: string;
	published?: string;
	location?: string;
}): { file: string } {
	const content = (input.content || "").trim();
	if (!content) throw new Error("动态内容不能为空");
	const published = input.published?.trim() || nowInZone(getBlogTimezone());
	const entries = readDiaryEntries();
	const nextId = entries.reduce((max, e) => Math.max(max, Number(e.id) || 0), 0) + 1;
	const entry: DiaryEntry = { id: nextId, content, date: publishedToDiaryDate(published) };
	if (input.location?.trim()) entry.location = input.location.trim();
	entries.push(entry);
	writeDiaryEntries(entries);
	return { file: `diary:${nextId}` };
}

function updateDiaryDynamic(
	rel: string,
	input: { content?: string; published?: string; location?: string }
): { file: string } {
	const id = Number(rel.replace(/^diary:/, ""));
	const entries = readDiaryEntries();
	const entry = entries.find((e) => Number(e.id) === id);
	if (!entry) throw new Error("日记不存在");
	if (input.content !== undefined) entry.content = input.content;
	if (input.published?.trim()) entry.date = publishedToDiaryDate(input.published.trim());
	if (input.location !== undefined) {
		if (input.location.trim()) entry.location = input.location.trim();
		else delete entry.location;
	}
	writeDiaryEntries(entries);
	return { file: rel };
}

function deleteDiaryDynamic(rel: string): void {
	const id = Number(rel.replace(/^diary:/, ""));
	const entries = readDiaryEntries();
	const kept = entries.filter((e) => Number(e.id) !== id);
	if (kept.length === entries.length) throw new Error("日记不存在");
	writeDiaryEntries(kept);
}

// ── 按主题分发 ──

export function listDynamics(): DynamicItem[] {
	const kind = activeCapabilities().dynamics;
	return kind === "diaryTs" ? listDiaryDynamics() : kind === "markdown" ? listMarkdownDynamics() : [];
}

function requireDynamics(): "markdown" | "diaryTs" {
	const kind = activeCapabilities().dynamics;
	if (!kind) throw new Error(`该主题（${activeCapabilities().theme}）没有动态/日记功能`);
	return kind;
}

export function createDynamic(input: {
	content: string;
	published?: string;
	pinned?: boolean;
	location?: string;
}): { file: string } {
	if (requireDynamics() === "diaryTs") {
		return createDiaryDynamic({ content: input.content, published: input.published, location: input.location });
	}
	return createMarkdownDynamic(input);
}

export function getDynamic(rel: string): DynamicItem {
	if (rel.startsWith("diary:") || requireDynamics() === "diaryTs") {
		const entries = readDiaryEntries();
		const id = Number(rel.replace(/^diary:/, ""));
		const entry = entries.find((e) => Number(e.id) === id);
		if (!entry) throw new Error("日记不存在");
		return {
			file: rel,
			published: diaryDateToPublished(entry.date),
			pinned: false,
			location: String(entry.location ?? ""),
			content: String(entry.content ?? ""),
		};
	}
	return getMarkdownDynamic(rel);
}

export function updateDynamic(
	rel: string,
	input: { content?: string; published?: string; pinned?: boolean; location?: string }
): { file: string } {
	if (rel.startsWith("diary:") || requireDynamics() === "diaryTs") {
		return updateDiaryDynamic(rel, input);
	}
	return updateMarkdownDynamic(rel, input);
}

export function deleteDynamic(rel: string): void {
	if (rel.startsWith("diary:") || requireDynamics() === "diaryTs") {
		deleteDiaryDynamic(rel);
		return;
	}
	deleteMarkdownDynamic(rel);
}
