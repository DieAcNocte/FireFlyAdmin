/**
 * 浏览器端 frontmatter 解析与序列化。
 * 与 server/content/frontmatter.ts 保持一致：
 * - 解析用 js-yaml（gray-matter 内核，日期解析为 Date）
 * - 序列化自实现：YAML 日期保持裸格式（加引号会导致 Astro content schema 校验失败）
 */
import { load as yamlLoad } from "js-yaml";

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
	const src = raw.replace(/^\uFEFF/, "");
	const m = src.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
	if (!m) {
		return { data: {}, body: src.replace(/^[ \t]*\r?\n+/, "").replace(/\s+$/, "") };
	}
	let data: Record<string, unknown> = {};
	try {
		data = (yamlLoad(m[1]) ?? {}) as Record<string, unknown>;
	} catch {
		/* YAML 解析失败按空处理 */
	}
	const body = src.slice(m[0].length).replace(/^[ \t]*\r?\n+/, "").replace(/\s+$/, "");
	return { data, body };
}

function yamlScalar(v: unknown): string {
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	if (typeof v === "string") {
		if (v === "") return "''";
		if (/^[\w\-./:@#]+$/.test(v)) return v; // URL/日期/英文等安全裸写
		return JSON.stringify(v);
	}
	return JSON.stringify(String(v));
}

function yamlInlineArray(items: unknown[]): string {
	if (!items.length) return "[]";
	return `[${items.map((i) => (typeof i === "string" ? (/^[\w\-./:@#]+$/.test(i) ? i : JSON.stringify(i)) : String(i))).join(", ")}]`;
}

/**
 * 序列化为 frontmatter 文本。
 * entries 为有序键值对；value 支持:
 *  - {type:"date", value:"YYYY-MM-DD"} → 裸写
 *  - {type:"datetime", value:"YYYY-MM-DD HH:mm:ss"} → 裸写（保持空格分隔）
 *  - 其他基础类型/字符串数组
 */
export type FmValue =
	| { type: "date"; value: string }
	| { type: "datetime"; value: string }
	| string
	| number
	| boolean
	| string[]
	| undefined;

export function serializeFrontmatter(entries: Record<string, FmValue>): string {
	const lines: string[] = [];
	for (const [key, raw] of Object.entries(entries)) {
		if (raw === undefined) continue;
		if (raw && typeof raw === "object" && "type" in raw) {
			const v = raw.value;
			if (raw.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) lines.push(`${key}: ${v}`);
			else if (raw.type === "datetime" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) lines.push(`${key}: ${v}`);
			else lines.push(`${key}: ${yamlScalar(v)}`);
			continue;
		}
		if (Array.isArray(raw)) lines.push(`${key}: ${yamlInlineArray(raw)}`);
		else if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
			lines.push(`${key}: ${yamlScalar(raw)}`);
		}
	}
	return `---\n${lines.join("\n")}\n---`;
}

/** 日期格式化：Date → "YYYY-MM-DD"（UTC，对应 YAML 无时区日期的解析结果） */
export function formatDate(d: unknown): string {
	if (d instanceof Date) return d.toISOString().slice(0, 10);
	return String(d ?? "");
}

/** 日期时间格式化：Date → "YYYY-MM-DD HH:mm:ss"（本地时间，对应 YAML 无时区时间戳） */
export function formatDateTime(d: unknown): string {
	if (d instanceof Date) {
		const p = (n: number) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
	}
	return String(d ?? "");
}

/** 当前时区(now 或指定 Date)的 "YYYY-MM-DD HH:mm:ss" */
export function nowInZone(tz: string, base = new Date()): string {
	try {
		const date = new Intl.DateTimeFormat("en-CA", {
			timeZone: tz,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(base);
		const time = new Intl.DateTimeFormat("en-GB", {
			timeZone: tz,
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		}).format(base);
		return `${date} ${time}`;
	} catch {
		const p = (n: number) => String(n).padStart(2, "0");
		const date = `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}`;
		const time = `${p(base.getHours())}:${p(base.getMinutes())}:${p(base.getSeconds())}`;
		return `${date} ${time}`;
	}
}
