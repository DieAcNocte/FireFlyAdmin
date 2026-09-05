import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, serializeFrontmatter, formatDateTime, nowInZone, type FmValue } from "./frontmatter.js";
import { getBlogTimezone } from "./posts.js";
import { activeDirs, ensureInside } from "../paths.js";

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

export function listDynamics(): DynamicItem[] {
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

export function createDynamic(input: {
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

export function getDynamic(rel: string): DynamicItem {
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

export function updateDynamic(
	rel: string,
	input: { content?: string; published?: string; pinned?: boolean; location?: string }
): { file: string } {
	const oldFile = resolveDynamicFile(rel);
	const existing = getDynamic(rel);
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

export function deleteDynamic(rel: string): void {
	fs.rmSync(resolveDynamicFile(rel));
}
