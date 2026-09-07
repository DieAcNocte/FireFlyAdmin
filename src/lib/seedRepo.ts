/**
 * 内置 FireFly 模板快照（public/seed/，随 APK 打包）：
 * 离线只读数据源——未配置自己的仓库时，直连模式从这里读取模板内容。
 * 由 scripts/build-seed.mjs 从上游仓库（CuteLeaf/Firefly@master）生成。
 */

import { ghConfig, isGithubMode, UPSTREAM_TEMPLATE } from "../api/base";

export interface SeedEntry {
	name: string;
	path: string;
	type: "file" | "dir";
	size: number;
	sha: string;
}

interface SeedManifest {
	source: string;
	generated: string;
	files: { path: string; size: number }[];
}

/**
 * 内置模板快照模式：连接配置为上游 FireFly 且未填令牌时，
 * 读取走打包在 APK 内的离线快照（public/seed/），安装即可离线预览模板。
 */
export function useSeedMode(): boolean {
	return (
		isGithubMode() &&
		ghConfig.value.owner === UPSTREAM_TEMPLATE.owner &&
		ghConfig.value.repo === UPSTREAM_TEMPLATE.repo &&
		!ghConfig.value.token
	);
}

let manifestPromise: Promise<SeedManifest> | null = null;

async function manifest(): Promise<SeedManifest> {
	manifestPromise ??= (async () => {
		const res = await fetch("/seed/manifest.json");
		if (!res.ok) throw new Error("内置模板清单缺失");
		return (await res.json()) as SeedManifest;
	})();
	return manifestPromise;
}

/** 解析快照内实际文件路径：配置引用 .avif 时自动映射到打包的 .webp（安卓 WebView 兼容） */
export async function seedResolve(path: string): Promise<string | null> {
	const clean = path.replace(/^\/+/, "");
	const m = await manifest();
	if (m.files.some((f) => f.path === clean)) return clean;
	if (/\.avif$/i.test(clean)) {
		const alt = clean.replace(/\.avif$/i, ".webp");
		if (m.files.some((f) => f.path === alt)) return alt;
	}
	return null;
}

/** 读取模板快照文件内容；不存在返回 null */
export async function seedText(path: string): Promise<string | null> {
	const resolved = await seedResolve(path);
	if (!resolved) return null;
	const res = await fetch(`/seed/${resolved}`);
	return res.ok ? await res.text() : null;
}

/** 列目录（模拟 GitHub contents 语义：一层内的文件 + 子目录折叠） */
export async function seedListDir(dir: string): Promise<SeedEntry[]> {
	const m = await manifest();
	const prefix = `${dir.replace(/\/+$/, "")}/`;
	const seen = new Set<string>();
	const out: SeedEntry[] = [];
	for (const f of m.files) {
		if (!f.path.startsWith(prefix)) continue;
		const rest = f.path.slice(prefix.length);
		const slash = rest.indexOf("/");
		if (slash === -1) {
			out.push({ name: rest, path: f.path, type: "file", size: f.size, sha: "seed" });
		} else {
			const name = rest.slice(0, slash);
			if (!seen.has(name)) {
				seen.add(name);
				out.push({ name, path: `${prefix}${name}`, type: "dir", size: 0, sha: "seed" });
			}
		}
	}
	return out;
}

/** 文件或目录是否存在 */
export async function seedExists(path: string): Promise<boolean> {
	const clean = path.replace(/\/+$/, "");
	if (await seedResolve(clean)) return true;
	const m = await manifest();
	if (m.files.some((f) => f.path === clean)) return true;
	return m.files.some((f) => f.path.startsWith(`${clean}/`));
}

/** 外链图片镜像的仓库内前缀（build-seed.mjs 下载到 public/seed/remote/<host>/<path>） */
const REMOTE_MIRROR_PREFIX = "remote/";

/**
 * 快照模式下把命中本地镜像的外链图片 URL 改写为 /seed/ 路径，实现完全离线预览。
 * 未命中镜像（或非快照模式）时原样返回。
 */
export async function localizeUrl(url: string): Promise<string> {
	if (!useSeedMode() || !/^https?:\/\//i.test(url)) return url;
	try {
		const u = new URL(url);
		const resolved = await seedResolve(`${REMOTE_MIRROR_PREFIX}${u.host}${u.pathname}`);
		return resolved ? `/seed/${resolved}` : url;
	} catch {
		return url;
	}
}

/** 将文本（markdown 正文等）中所有命中本地镜像的外链图片 URL 批量改写为 /seed/ 路径 */
export async function localizeRemoteImages(text: string): Promise<string> {
	if (!useSeedMode() || !text) return text;
	const urls = [...new Set(text.match(/https?:\/\/[^\s"'<>)]+\.(?:webp|jpe?g|png|gif|avif)/gi) ?? [])];
	if (!urls.length) return text;
	let out = text;
	for (const url of urls) out = out.replaceAll(url, await localizeUrl(url));
	return out;
}
