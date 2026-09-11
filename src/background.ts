/** 管理后台自定义背景管理（应用设置 → 背景外观）。电脑端与手机端各存一份、互不影响，均保存在本设备存储中，与「主页图片」页管理的博客端壁纸无关 */

import { isMobile } from "./api/base";

export interface BackgroundConfig {
	enabled: boolean;
	/** 背景图片：本地上传为压缩后的 data URL，或远程 http(s) URL */
	url: string;
	/** 背景模糊半径（px，0-30） */
	blur: number;
	/** 黑色遮罩不透明度（%，0-80），压暗背景保证前景可读 */
	dim: number;
}

/** 背景目标端：电脑端 / 手机端分别独立设置与应用 */
export type BgTarget = "desktop" | "mobile";

const KEY = "app.background.v2";
/** 旧版单份配置的键，读取后迁移到新结构 */
const LEGACY_KEY = "app.background";

const DEFAULTS: BackgroundConfig = { enabled: false, url: "", blur: 0, dim: 30 };

interface StoredBackgrounds {
	desktop: BackgroundConfig;
	mobile: BackgroundConfig;
}

/** 当前设备对应的背景端（Capacitor 原生壳 / 窄窗口 = 手机端，其余为电脑端） */
export function currentBgTarget(): BgTarget {
	return isMobile ? "mobile" : "desktop";
}

function normalize(raw: unknown): BackgroundConfig {
	const parsed = (raw ?? {}) as Partial<BackgroundConfig>;
	const url = typeof parsed.url === "string" ? parsed.url : "";
	return {
		enabled: parsed.enabled === true && !!url,
		url,
		blur: clamp(Number(parsed.blur ?? DEFAULTS.blur), 0, 30),
		dim: clamp(Number(parsed.dim ?? DEFAULTS.dim), 0, 80),
	};
}

function fallback(): StoredBackgrounds {
	return { desktop: { ...DEFAULTS }, mobile: { ...DEFAULTS } };
}

function loadStored(): StoredBackgrounds {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) {
			// 旧版单份配置迁移：归入当前设备对应端，避免升级后丢失已设置的背景
			const legacy = localStorage.getItem(LEGACY_KEY);
			if (!legacy) return fallback();
			const cfg = normalize(JSON.parse(legacy));
			localStorage.removeItem(LEGACY_KEY);
			const stored = fallback();
			stored[currentBgTarget()] = cfg;
			localStorage.setItem(KEY, JSON.stringify(stored));
			return stored;
		}
		const parsed = JSON.parse(raw) as Partial<StoredBackgrounds>;
		return { desktop: normalize(parsed.desktop), mobile: normalize(parsed.mobile) };
	} catch {
		return fallback();
	}
}

/** 读取指定端（默认当前设备端）的背景配置 */
export function loadBackground(target?: BgTarget): BackgroundConfig {
	const stored = loadStored();
	return { ...stored[target ?? currentBgTarget()] };
}

/** 持久化指定端的配置；若为当前设备端则立即生效。存储失败（如图片过大超出配额）抛错，由调用方提示 */
export function saveBackground(cfg: BackgroundConfig, target?: BgTarget): void {
	const t = target ?? currentBgTarget();
	const stored = loadStored();
	stored[t] = { ...cfg };
	localStorage.setItem(KEY, JSON.stringify(stored));
	if (t === currentBgTarget()) applyBackground(cfg);
}

/** 应用背景到文档根节点（has-bg 类 + CSS 变量，样式见 style.css） */
export function applyBackground(cfg: BackgroundConfig): void {
	const root = document.documentElement;
	if (!cfg.enabled || !cfg.url) {
		root.classList.remove("has-bg");
		return;
	}
	root.classList.add("has-bg");
	root.style.setProperty("--app-bg-image", `url("${cfg.url}")`);
	root.style.setProperty("--app-bg-blur", `${cfg.blur}px`);
	root.style.setProperty("--app-bg-dim", String(cfg.dim / 100));
}

function clamp(n: number, min: number, max: number): number {
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

/** 本地图片 → 压缩 data URL（最长边 1920 的 JPEG，约几百 KB），避免超出 localStorage 配额 */
export function fileToBackgroundDataUrl(file: File): Promise<string> {
	const srcUrl = URL.createObjectURL(file);
	const img = new Image();
	return new Promise((resolve, reject) => {
		img.onload = () => {
			try {
				const scale = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
				const canvas = document.createElement("canvas");
				canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
				canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
				const ctx = canvas.getContext("2d");
				if (!ctx) throw new Error("无法创建画布");
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
				resolve(canvas.toDataURL("image/jpeg", 0.82));
			} catch (e) {
				reject(e instanceof Error ? e : new Error(String(e)));
			} finally {
				URL.revokeObjectURL(srcUrl);
			}
		};
		img.onerror = () => {
			URL.revokeObjectURL(srcUrl);
			reject(new Error("图片读取失败"));
		};
		img.src = srcUrl;
	});
}
