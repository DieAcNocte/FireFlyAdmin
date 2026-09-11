/**
 * 远程连接基础设施：
 * - 桌面 Web（Hono 同源托管）：apiBase 为空，全部走相对路径（行为与旧版一致）
 * - Capacitor App「电脑模式」：UI 打包进 App，API 请求指向用户配置的电脑/NAS 服务器地址
 * - Capacitor App「GitHub 直连模式」：不依赖电脑，App 直接通过 GitHub API 读写博客仓库
 * - 手机浏览器直接访问电脑：同源相对路径可用，但服务端若设置了访问令牌则需填写
 */
import { ref } from "vue";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

/** 是否运行在 Capacitor 原生壳中（Android/iOS App） */
export const isNative = Capacitor.isNativePlatform();

/**
 * 手机端形态判定：
 * - Capacitor 原生壳（手机/平板 App）一律按手机端渲染，横屏也不会切到电脑端布局
 * - 桌面浏览器 / FireflyAdmin.exe 按屏幕宽度判断（窄窗口临时呈现手机形态）
 */
export const isMobile = isNative || (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches);

/** 连接模式：server = 电脑端 Hono 服务；github = 直连 GitHub 仓库（独立使用） */
export type ConnMode = "server" | "github";

export const connMode = ref<ConnMode>("server");

/** GitHub 直连仓库配置 */
export interface GhConfig {
	owner: string;
	repo: string;
	branch: string;
	token: string;
	/** 提交信息模板（留空用内置默认） */
	commitMessage: string;
}

export const ghConfig = ref<GhConfig>({ owner: "", repo: "", branch: "main", token: "", commitMessage: "" });

/** 服务器地址（仅原生壳 server 模式使用，形如 http://192.168.1.5:5175，无尾斜杠） */
export const serverUrl = ref("");

/** 访问令牌（server 模式：服务端「应用设置 → 局域网访问」中设置） */
export const serverToken = ref("");

export const isGithubMode = () => connMode.value === "github";

/** 用户在连接屏选择「跳过」：不再自动弹出连接屏，可进 App 预览界面（已持久化，配置时自动清除） */
export const skipped = ref(false);

/** 尚未完成连接配置（未选模式 / server 未填地址 / github 未填仓库） */
export const needsConnectConfig = () => {
	if (isNative && skipped.value) return false; // 已跳过：直接进主界面预览
	if (!connModeConfigured.value) return isNative; // 浏览器默认 server 同源模式，无需配置；原生壳首次使用需配置
	return isGithubMode() ? !ghConfig.value.owner || !ghConfig.value.repo : isNative && !serverUrl.value;
};

/** 标记跳过（持久化：重启 App 后不再弹出连接配置，可随时从菜单「连接设置」进入）。跳过即默认使用 GitHub 直连模式 */
export async function markSkipped(): Promise<void> {
	skipped.value = true;
	await switchConnMode("github");
	await Preferences.set({ key: KEY_SKIP, value: "true" });
}

/** 切换连接模式（保留各自已保存的仓库/地址信息），由调用方刷新页面生效 */
export async function switchConnMode(mode: ConnMode): Promise<void> {
	await Preferences.set({ key: KEY_MODE, value: mode });
	connMode.value = mode;
	connModeConfigured.value = true;
}

/** 是否已保存过连接模式（区分「从未配置」与「配置了但失败」） */
const connModeConfigured = ref(false);

/** 服务端开启了访问令牌而本端未携带，由 API 层在收到 401 时置位（仅 server 模式） */
export const unauthorized = ref(false);

/** 上游 FireFly 模板仓库：默认预填（快照打包进 APK 离线只读；master 为上游实际默认分支） */
export const UPSTREAM_TEMPLATE = { owner: "CuteLeaf", repo: "Firefly", branch: "master" };

// ── 设备本地偏好（直连模式：保存在手机本地，与电脑端偏好互相独立）──
const KEY_COLOR = "device.colorMode";
const KEY_BLOG = "device.blogMode";

/** 界面配色（手机本地） */
export const deviceColorMode = ref<"light" | "dark" | "system">("light");
/** 博客模式覆盖（手机本地：auto 按仓库文件识别 | firefly / mizuki 强制指定） */
export const deviceBlogMode = ref<"auto" | "firefly" | "mizuki">("auto");

export async function saveDeviceColorMode(mode: "light" | "dark" | "system"): Promise<void> {
	deviceColorMode.value = mode;
	await Preferences.set({ key: KEY_COLOR, value: mode });
}

export async function saveDeviceBlogMode(mode: "auto" | "firefly" | "mizuki"): Promise<void> {
	deviceBlogMode.value = mode;
	await Preferences.set({ key: KEY_BLOG, value: mode });
}

// ── 持久化键 ──
const KEY_MODE = "conn.mode";
const KEY_SKIP = "conn.skipped";
const KEY_URL = "server.url";
const KEY_TOKEN = "server.token";
const KEY_GH_OWNER = "gh.owner";
const KEY_GH_REPO = "gh.repo";
const KEY_GH_BRANCH = "gh.branch";
const KEY_GH_TOKEN = "gh.token";
const KEY_GH_MESSAGE = "gh.commitMessage";

let initPromise: Promise<void> | null = null;

/** 应用启动时调用：从设备本地存储读取连接配置（幂等） */
export function initApiBase(): Promise<void> {
	if (!initPromise) {
		initPromise = (async () => {
			try {
				const [m, s, u, t, owner, repo, branch, ghToken, message, color, blog] = await Promise.all([
					Preferences.get({ key: KEY_MODE }),
					Preferences.get({ key: KEY_SKIP }),
					Preferences.get({ key: KEY_URL }),
					Preferences.get({ key: KEY_TOKEN }),
					Preferences.get({ key: KEY_GH_OWNER }),
					Preferences.get({ key: KEY_GH_REPO }),
					Preferences.get({ key: KEY_GH_BRANCH }),
					Preferences.get({ key: KEY_GH_TOKEN }),
					Preferences.get({ key: KEY_GH_MESSAGE }),
					Preferences.get({ key: KEY_COLOR }),
					Preferences.get({ key: KEY_BLOG }),
				]);
				serverUrl.value = (u.value ?? "").trim().replace(/\/+$/, "");
				serverToken.value = t.value ?? "";
				ghConfig.value = {
					owner: owner.value ?? "",
					repo: repo.value ?? "",
					branch: branch.value?.trim() || "main",
					token: ghToken.value ?? "",
					commitMessage: message.value ?? "",
				};
				if (color.value === "light" || color.value === "dark" || color.value === "system") {
					deviceColorMode.value = color.value;
				}
				if (blog.value === "auto" || blog.value === "firefly" || blog.value === "mizuki") {
					deviceBlogMode.value = blog.value;
				}
				skipped.value = s.value === "true";
				if (m.value === "github" || m.value === "server") {
					connMode.value = m.value;
					connModeConfigured.value = true;
				} else if (serverUrl.value) {
					// 旧版本仅配置过服务器地址：视为 server 模式，避免升级后重复配置
					connMode.value = "server";
					connModeConfigured.value = true;
				}
				// ── 首次启动预置：上游 FireFly 模板仓库写为默认连接（快照打包在 APK 内，安装即可直接预览）──
				if (isNative && !ghConfig.value.owner) {
					ghConfig.value = {
						owner: UPSTREAM_TEMPLATE.owner,
						repo: UPSTREAM_TEMPLATE.repo,
						branch: UPSTREAM_TEMPLATE.branch,
						token: "",
						commitMessage: "",
					};
					await Preferences.set({ key: KEY_GH_OWNER, value: ghConfig.value.owner });
					await Preferences.set({ key: KEY_GH_REPO, value: ghConfig.value.repo });
					await Preferences.set({ key: KEY_GH_BRANCH, value: ghConfig.value.branch });
				} else if (
					isNative &&
					ghConfig.value.owner === UPSTREAM_TEMPLATE.owner &&
					ghConfig.value.repo === UPSTREAM_TEMPLATE.repo &&
					ghConfig.value.branch !== UPSTREAM_TEMPLATE.branch
				) {
					// 早期预置版本的分支修正（上游实际默认分支为 master）
					ghConfig.value.branch = UPSTREAM_TEMPLATE.branch;
					await Preferences.set({ key: KEY_GH_BRANCH, value: UPSTREAM_TEMPLATE.branch });
				}
				if (isNative && !connModeConfigured.value) {
					// 默认连接方式：GitHub 直连（配合上方模板仓库，开箱即看）
					connMode.value = "github";
					connModeConfigured.value = true;
					await Preferences.set({ key: KEY_MODE, value: "github" });
				}
			} catch {
				/* 读取失败按未配置处理 */
			}
		})();
	}
	return initPromise;
}

/** 保存电脑模式连接配置（连接屏调用），成功后由调用方刷新页面生效 */
export async function saveServerConfig(url: string, token: string): Promise<void> {
	const cleanUrl = url.trim().replace(/\/+$/, "");
	await Promise.all([
		Preferences.set({ key: KEY_MODE, value: "server" }),
		Preferences.set({ key: KEY_SKIP, value: "false" }),
		Preferences.set({ key: KEY_URL, value: cleanUrl }),
		Preferences.set({ key: KEY_TOKEN, value: token.trim() }),
	]);
	connMode.value = "server";
	connModeConfigured.value = true;
	skipped.value = false;
	serverUrl.value = cleanUrl;
	serverToken.value = token.trim();
}

/** 解析仓库输入：支持 owner/repo 或 https://github.com/owner/repo(.git) */
export function parseRepoInput(input: string): { owner: string; repo: string } | null {
	const s = input.trim().replace(/\.git$/i, "");
	const m = s.match(/github\.com[/:]([^/]+)\/([^/?#]+)/i) ?? s.match(/^([\w.-]+)\/([\w.-]+)$/);
	if (!m) return null;
	return { owner: m[1], repo: m[2] };
}

/** 保存 GitHub 直连配置（连接屏调用），成功后由调用方刷新页面生效 */
export async function saveGithubConfig(cfg: GhConfig): Promise<void> {
	await Promise.all([
		Preferences.set({ key: KEY_MODE, value: "github" }),
		Preferences.set({ key: KEY_SKIP, value: "false" }),
		Preferences.set({ key: KEY_GH_OWNER, value: cfg.owner.trim() }),
		Preferences.set({ key: KEY_GH_REPO, value: cfg.repo.trim() }),
		Preferences.set({ key: KEY_GH_BRANCH, value: cfg.branch.trim() || "main" }),
		Preferences.set({ key: KEY_GH_TOKEN, value: cfg.token.trim() }),
		Preferences.set({ key: KEY_GH_MESSAGE, value: cfg.commitMessage.trim() }),
	]);
	connMode.value = "github";
	connModeConfigured.value = true;
	skipped.value = false;
	ghConfig.value = { ...cfg, owner: cfg.owner.trim(), repo: cfg.repo.trim(), branch: cfg.branch.trim() || "main", token: cfg.token.trim(), commitMessage: cfg.commitMessage.trim() };
}

/** API 请求的基址：原生壳 server 模式为配置的服务器地址，其余为空（同源相对路径） */
export function apiBase(): string {
	return isNative && !isGithubMode() ? serverUrl.value : "";
}

/**
 * 拼接服务端资源地址（图片等 <img> 场景，仅 server 模式）：
 * server 模式下补全为绝对地址；已配置令牌时附加 ?token=（请求头无法用于 img 标签）
 */
export function apiUrl(path: string): string {
	if (!path) return path;
	const abs = /^https?:\/\//i.test(path) ? path : apiBase() + path;
	if (!isGithubMode() && serverToken.value) {
		return abs + (abs.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(serverToken.value);
	}
	return abs;
}
