import { apiBase, serverToken, unauthorized, isGithubMode } from "./base";
import { githubApi } from "./github";

/** 极简 API client：统一错误处理（原生壳下请求指向配置的远程服务器） */
async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
	const headers: Record<string, string> = {};
	if (body !== undefined) headers["Content-Type"] = "application/json";
	if (serverToken.value) headers["Authorization"] = `Bearer ${serverToken.value}`;
	let res: Response;
	try {
		res = await fetch(`${apiBase()}/api${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
	} catch {
		throw new Error("无法连接服务器，请检查电脑端服务是否运行、地址是否正确");
	}
	let data: any = null;
	try {
		data = await res.json();
	} catch {
		/* 非 JSON 响应 */
	}
	if (!res.ok) {
		if (res.status === 401) unauthorized.value = true;
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
	/** urls.txt 外链照片（非仓库文件：不可删除/设封面，url 为完整 http 地址） */
	remote?: boolean;
}

export interface ThemeCapabilities {
	theme: "firefly" | "mizuki" | "fuwari" | "unknown";
	gallery: "config" | "scanner" | null;
	dynamics: "markdown" | "diaryTs" | null;
	dynamicsPinned: boolean;
	wallpaper: "background" | "mizuki" | null;
	/** 配置文件布局：dir = src/config/*.ts（v9+）；single = src/config.ts（v8.x） */
	configLayout: "dir" | "single" | null;
	demoReset: boolean;
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

export interface AppPreferences {
	uploadConvertAvif: boolean;
	closeAction: "exit" | "background";
	port: number;
	colorMode: "light" | "dark" | "system";
	/** 博客模式：auto 按项目自动识别 | firefly / mizuki 手动指定 */
	blogMode: "auto" | "firefly" | "mizuki";
	/** 允许局域网设备（手机/平板）访问（重启服务生效） */
	lanAccess: boolean;
	/** 局域网访问令牌（非本机请求需携带） */
	accessToken: string;
}

export interface AppRuntime {
	sea: boolean;
	pid: number;
	port: number;
	closeAction: "exit" | "background";
	lanAccess: boolean;
	lanAddresses: string[];
}

// ── API ──

const serverApi = {
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
			theme: string;
			counts: { posts: number; dynamics: number; albums: number; desktopWallpapers: number; mobileWallpapers: number };
			git: { branch: string; changed: number; ahead: number; behind: number } | null;
			dev: { running: boolean; cwd: string | null; logs: string[]; url: string };
			/** 直连模式附加：最近提交 */
			commits?: GitCommit[];
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
		entries: () => get<{ theme: string; configLayout: string | null; entries: ConfigEntry[] }>("/configs"),
		get: (file: string) => get<{ file: string; exportName: string; title: string; fields: FieldSpec[] }>(`/configs/${file}`),
		saveFields: (file: string, values: { path: string; value: unknown }[]) =>
			put<{ ok: boolean; applied: string[] }>(`/configs/${file}/fields`, { values }),
		rawList: () => get<{ files: { file: string; size: number; mtime: number }[] }>("/configs/raw/all"),
		rawGet: (file: string) => get<ConfigFile>(`/configs/raw/${file}`),
		rawSave: (file: string, content: string) => put<{ ok: boolean }>(`/configs/raw/${file}`, { content }),
	},
	theme: {
		get: () => get<ThemeCapabilities>("/theme"),
	},
	gallery: {
		get: () =>
			get<{ theme: string; albums: Record<string, unknown>[]; columnWidth: number | null }>("/gallery"),
		save: (albums: Record<string, unknown>[], columnWidth?: number | null) =>
			put<{ ok: boolean }>("/gallery", { albums, columnWidth: columnWidth ?? undefined }),
		remove: (albumId: string) => del<{ ok: boolean }>(`/gallery/${encodeURIComponent(albumId)}`),
		images: (albumId: string) => get<{ images: GalleryImage[] }>(`/gallery/${encodeURIComponent(albumId)}/images`),
		setCover: (albumId: string, file: string) => post<{ ok: boolean }>(`/gallery/${encodeURIComponent(albumId)}/cover`, { file }),
		/** 相册列表封面缩略图与照片数：仅直连模式实现（电脑端由已选相册的图片列表提供） */
		covers: (_albums?: Record<string, unknown>[]) => Promise.resolve({ covers: {} as Record<string, string>, counts: {} as Record<string, number> }),
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
	app: {
		prefs: () => get<AppPreferences>("/app/preferences"),
		savePrefs: (p: Partial<AppPreferences>) => put<{ ok: boolean; preferences: AppPreferences }>("/app/preferences", p),
		runtime: () => get<AppRuntime>("/app/runtime"),
		stop: () => post<{ ok: boolean }>("/app/stop"),
	},
	setup: {
		status: () =>
			get<{
				setupCompleted: boolean;
				project: { id: string; name: string; localPath: string; remoteUrl: string; token: boolean; branch: string };
				validation: { ok: boolean; problems: string[] };
				isGitRepo: boolean;
			}>("/setup/status"),
		complete: () => post<{ ok: boolean }>("/setup/complete"),
		rerun: () => post<{ ok: boolean }>("/setup/rerun"),
		demo: () => post<{ ok: boolean; post: string; dynamic: string }>("/setup/demo"),
		sshKeygen: () => post<{ ok: boolean; publicKey: string; keyPath: string }>("/setup/ssh-keygen"),
		testRemote: (url: string, token?: string) => post<{ ok: boolean; message: string }>("/setup/test-remote", { url, token }),
		sync: () => post<{ ok: boolean; action: "clone" | "pull"; message: string }>("/setup/sync"),
		forceSync: () => post<{ ok: boolean; message: string }>("/setup/force-sync"),
	},
};

/**
 * 对外 API 入口：按连接模式分发。
 * - server（默认）：电脑端 Hono 服务
 * - github：GitHub 直连（仅 posts/dynamics/pages/theme/图片上传可用，其余模块由路由层隐藏）
 */
export const api: typeof serverApi = new Proxy(serverApi, {
	get(target, prop) {
		if (isGithubMode()) return Reflect.get(githubApi, prop);
		return Reflect.get(target, prop);
	},
});

/** 上传图片（multipart） */
export async function uploadImages(target: string, files: File[], albumId?: string, convertAvif = false): Promise<{ saved: string[] }> {
	if (isGithubMode()) {
		return githubApi.uploads.images(target, files, albumId);
	}
	const form = new FormData();
	form.append("target", target);
	if (albumId) form.append("albumId", albumId);
	if (convertAvif) form.append("convertAvif", "true");
	for (const f of files) form.append("files", f);
	const headers: Record<string, string> = {};
	if (serverToken.value) headers["Authorization"] = `Bearer ${serverToken.value}`;
	const res = await fetch(`${apiBase()}/api/images`, { method: "POST", headers, body: form });
	const data = await res.json();
	if (!res.ok) {
		if (res.status === 401) unauthorized.value = true;
		throw new Error(data?.error || "上传失败");
	}
	return data;
}
