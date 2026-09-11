/**
 * 草稿本地缓存：编辑内容随手写入 localStorage，导航返回、关闭窗口或崩溃后均可恢复。
 * - 按 scope（页面类型）+ 项目 + 文件标识隔离，不同项目互不可见
 * - 写入失败（隐私模式/容量超限）静默降级，不影响正常编辑
 */

export interface DraftData {
	/** 表单字段快照（字段名与编辑器 form 一致） */
	form: Record<string, unknown>;
	/** 正文 Markdown */
	body: string;
	/** 最近保存时间戳 */
	savedAt: number;
	/** 关联的文章文件路径（新建文章时为空） */
	file?: string;
}

const PREFIX = "ff-admin:draft:";

export function draftKey(scope: string, id: string): string {
	return `${PREFIX}${scope}:${id}`;
}

export function readDraft<T = DraftData>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

export function writeDraft(key: string, data: unknown): boolean {
	try {
		localStorage.setItem(key, JSON.stringify(data));
		return true;
	} catch {
		return false;
	}
}

export function clearDraft(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		/* ignore */
	}
}

/** 草稿是否有可恢复的实质内容 */
export function draftHasContent(d: DraftData | null): boolean {
	if (!d) return false;
	const title = typeof d.form?.title === "string" ? d.form.title.trim() : "";
	return Boolean(title) || Boolean(String(d.body ?? "").trim());
}

export function formatDraftTime(ts: number): string {
	const d = new Date(ts);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
	let t: ReturnType<typeof setTimeout> | undefined;
	return (...a: A) => {
		clearTimeout(t);
		t = setTimeout(() => fn(...a), ms);
	};
}
