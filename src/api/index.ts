/** 极简 API client：统一错误处理 */
async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
	const res = await fetch(`/api${url}`, {
		method,
		headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
	let data: any = null;
	try {
		data = await res.json();
	} catch {
		/* 非 JSON 响应 */
	}
	if (!res.ok) {
		throw new Error(data?.error || `请求失败 (${res.status})`);
	}
	return data as T;
}

const get = <T,>(url: string) => request<T>("GET", url);
const post = <T,>(url: string, body?: unknown) => request<T>("POST", url, body ?? {});
const put = <T,>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {});
const del = <T,>(url: string) => request<T>("DELETE", url);

// ── 类型 ──

export interface ProjectProfile {
	id: string;
	name: string;
	localPath: string;
	remoteUrl: string;
	token: string;
	hasToken?: boolean;
	branch: string;
	authorName: string;
	authorEmail: string;
	messageTemplate: string;
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

export interface PostDetail {
	file: string;
	data: Record<string, unknown>;
	body: string;
}

export interface DynamicItem {
	file: string;
	published: string;
	pinned: boolean;
	location: string;
	content: string;
}

export interface SpecPage {
	file: string;
	name: string;
	ext: string;
}

export interface ItemFieldSpec {
	key: string;
	label: string;
	type: "string" | "text" | "number" | "boolean" | "stringArray";
	optional?: boolean;
	placeholder?: string;
}

export interface FieldSpec {
	path: string;
	label: string;
	type: string;
	options?: string[];
	itemFields?: ItemFieldSpec[];
	tip?: string;
	value?: unknown;
	readError?: string | null;
	exists?: boolean;
}

export interface ConfigEntry {
	file: string;
	exportName: string;
	title: string;
	description?: string;
	fields: FieldSpec[];
}

export interface ConfigFile {
	file: string;
	content: string;
}

export interface GalleryImage {
	name: string;
	size: number;
	mtime: number;
	url: string;
}

export interface GitFileItem {
	path: string;
	staged: boolean;
	modified: boolean;
	untracked: boolean;
	deleted: boolean;
}

export interface GitCommit {
	hash: string;
	author: string;
	date: string;
	message: string;
}

export interface ImageInfo {
	name: string;
	size: number;
	mtime: number;
	url: string;
}

// ── API ──

export const api = {
	projects: {
		list: () => get<{ activeProjectId: string; projects: ProjectProfile[] }>("/projects"),
		create: (p: Partial<ProjectProfile>) => post<{ ok: boolean; id: string }>("/projects", p),
		update: (id: string, p: Partial<ProjectProfile>) => put<{ ok: boolean }>(`/projects/${id}`, p),
		remove: (id: string) => del<{ ok: boolean }>(`/projects/${id}`),
		activate: (id: string) => post<{ ok: boolean }>(`/projects/${id}/activate`),
		validate: (localPath: string) => post<{ ok: boolean; problems: string[] }>("/projects/validate", { localPath }),
	},
	overview: () =>
		get<{
			project: { id: string; name: string; localPath: string; remoteUrl: string; branch: string };
			counts: { posts: number; dynamics: number; albums: number; desktopWallpapers: number; mobileWallpapers: number };
			git: { branch: string; changed: number; ahead: number; behind: number } | null;
			dev: { running: boolean; cwd: string | null; logs: string[]; url: string };
		}>("/blog/overview"),
	posts: {
		list: () => get<{ posts: PostSummary[] }>("/posts"),
		detail: (file: string) => get<PostDetail>(`/posts/detail?file=${encodeURIComponent(file)}`),
		create: (p: Record<string, unknown>) => post<{ file: string }>("/posts", p),
		update: (file: string, p: Record<string, unknown>) => put<{ file: string }>(`/posts?file=${encodeURIComponent(file)}`, p),
		remove: (file: string) => del<{ ok: boolean }>(`/posts?file=${encodeURIComponent(file)}`),
	},
	dynamics: {
		list: () => get<{ dynamics: DynamicItem[] }>("/dynamics"),
		create: (p: Record<string, unknown>) => post<{ file: string }>("/dynamics", p),
		update: (file: string, p: Record<string, unknown>) => put<{ file: string }>(`/dynamics?file=${encodeURIComponent(file)}`, p),
		remove: (file: string) => del<{ ok: boolean }>(`/dynamics?file=${encodeURIComponent(file)}`),
	},
	pages: {
		list: () => get<{ pages: SpecPage[] }>("/pages"),
		detail: (file: string) => get<{ file: string; content: string }>(`/pages/detail?file=${encodeURIComponent(file)}`),
		save: (file: string, content: string) => put<{ ok: boolean }>(`/pages?file=${encodeURIComponent(file)}`, { content }),
	},
	configs: {
		entries: () => get<{ entries: ConfigEntry[] }>("/configs"),
		get: (file: string) => get<{ file: string; exportName: string; title: string; fields: FieldSpec[] }>(`/configs/${file}`),
		saveFields: (file: string, values: { path: string; value: unknown }[]) =>
			put<{ ok: boolean; applied: string[] }>(`/configs/${file}/fields`, { values }),
		rawList: () => get<{ files: { file: string; size: number; mtime: number }[] }>("/configs/raw/all"),
		rawGet: (file: string) => get<ConfigFile>(`/configs/raw/${file}`),
		rawSave: (file: string, content: string) => put<{ ok: boolean }>(`/configs/raw/${file}`, { content }),
	},
	gallery: {
		get: () => get<{ albums: Record<string, unknown>[]; columnWidth: number }>("/gallery"),
		save: (albums: Record<string, unknown>[], columnWidth?: number) => put<{ ok: boolean }>("/gallery", { albums, columnWidth }),
		images: (albumId: string) => get<{ images: GalleryImage[] }>(`/gallery/${encodeURIComponent(albumId)}/images`),
		setCover: (albumId: string, file: string) => post<{ ok: boolean }>(`/gallery/${encodeURIComponent(albumId)}/cover`, { file }),
	},
	images: {
		list: (target: string, albumId?: string) =>
			get<{ images: ImageInfo[] }>(`/images?target=${target}${albumId ? `&albumId=${encodeURIComponent(albumId)}` : ""}`),
		remove: (target: string, name: string, albumId?: string) =>
			del<{ ok: boolean }>(`/images?target=${target}&name=${encodeURIComponent(name)}${albumId ? `&albumId=${encodeURIComponent(albumId)}` : ""}`),
	},
	git: {
		status: () => get<{ branch: string; ahead: number; behind: number; files: GitFileItem[]; remoteConfigured: boolean }>("/git/status"),
		commit: (message: string) => post<{ hash: string; message: string }>("/git/commit", { message }),
		push: () => post<{ ok: boolean; url: string; branch: string }>("/git/push"),
		log: () => get<{ commits: GitCommit[] }>("/git/log"),
	},
	blog: {
		devStatus: () => get<{ running: boolean; cwd: string | null; logs: string[]; url: string }>("/blog/dev"),
		devStart: () => post<{ running: boolean; logs: string[]; url: string }>("/blog/dev", { action: "start" }),
		devStop: () => post<{ running: boolean; logs: string[]; url: string }>("/blog/dev", { action: "stop" }),
	},
};

/** 上传图片（multipart） */
export async function uploadImages(target: string, files: File[], albumId?: string, convertAvif = false): Promise<{ saved: string[] }> {
	const form = new FormData();
	form.append("target", target);
	if (albumId) form.append("albumId", albumId);
	if (convertAvif) form.append("convertAvif", "true");
	for (const f of files) form.append("files", f);
	const res = await fetch("/api/images", { method: "POST", body: form });
	const data = await res.json();
	if (!res.ok) throw new Error(data?.error || "上传失败");
	return data;
}
