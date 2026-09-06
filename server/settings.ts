import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * 项目根目录：
 * - SEA 打包模式（FireflyAdmin.exe）：EXE 所在目录（数据/资源与 EXE 同级）
 * - 脚本模式（pnpm dev / pnpm start）：运行时工作目录（pnpm 脚本固定为项目根）
 */
function resolveRootDir(): string {
	if (typeof __SEA_BUILD !== "undefined" && __SEA_BUILD === "true") {
		return path.dirname(process.execPath);
	}
	return path.resolve(process.cwd());
}

export const ROOT_DIR = resolveRootDir();

const DATA_DIR = path.join(ROOT_DIR, "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

export interface ProjectProfile {
	id: string;
	name: string;
	/** 本地博客项目根目录 */
	localPath: string;
	/** 远程仓库地址（HTTPS / SSH），可为空 */
	remoteUrl: string;
	/** GitHub Personal Access Token，可为空（改用 SSH 认证） */
	token: string;
	branch: string;
	authorName: string;
	authorEmail: string;
	messageTemplate: string;
}

export interface AppPreferences {
	/** 上传图片时默认开启「转 AVIF」 */
	uploadConvertAvif: boolean;
	/** 关闭 EXE 控制台窗口时：exit 直接退出 | background 转入后台继续运行 */
	closeAction: "exit" | "background";
	/** 管理后台默认端口（重启后生效） */
	port: number;
	/** 管理后台界面配色 */
	colorMode: "light" | "dark" | "system";
	/** 博客模式：auto 按项目文件自动识别 | firefly / mizuki 手动指定（覆盖自动识别） */
	blogMode: "auto" | "firefly" | "mizuki";
}

export interface Settings {
	projects: ProjectProfile[];
	activeProjectId: string;
	preferences: AppPreferences;
	/** 初始设置向导是否已完成（旧配置文件迁移时自动置为 true） */
	setupCompleted: boolean;
}

const DEFAULT_PREFERENCES = (): AppPreferences => ({
	uploadConvertAvif: true,
	closeAction: "exit",
	port: 5175,
	colorMode: "light",
	blogMode: "auto",
});

const DEFAULT_SETTINGS = (): Settings => {
	// 默认项目：上游 FireFly（本地路径留空，由初始设置向导填入用户自己的博客目录）
	const upstream: ProjectProfile = {
		id: randomUUID(),
		name: "FireFly",
		localPath: "",
		remoteUrl: "https://github.com/CuteLeaf/Firefly.git",
		token: "",
		branch: "main",
		authorName: "",
		authorEmail: "",
		messageTemplate: "feat: 更新博客内容",
	};
	return { projects: [upstream], activeProjectId: upstream.id, preferences: DEFAULT_PREFERENCES(), setupCompleted: false };
};

let cached: Settings | null = null;

export function loadSettings(): Settings {
	if (cached) return cached;
	try {
		const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
		const parsed = JSON.parse(raw) as Settings;
		if (!Array.isArray(parsed.projects) || parsed.projects.length === 0) {
			throw new Error("invalid settings");
		}
		if (!parsed.projects.some((p) => p.id === parsed.activeProjectId)) {
			parsed.activeProjectId = parsed.projects[0].id;
		}
		// 旧版本设置文件迁移：补齐 preferences 与 setupCompleted（已有配置视为已完成向导）
		parsed.preferences = { ...DEFAULT_PREFERENCES(), ...(parsed.preferences ?? {}) };
		if (typeof parsed.setupCompleted !== "boolean") parsed.setupCompleted = true;
		cached = parsed;
	} catch {
		cached = DEFAULT_SETTINGS();
		saveSettings(cached);
	}
	return cached;
}

export function saveSettings(settings: Settings): void {
	cached = settings;
	fs.mkdirSync(DATA_DIR, { recursive: true });
	fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, "\t"), "utf-8");
}

export function getActiveProject(): ProjectProfile {
	const s = loadSettings();
	return s.projects.find((p) => p.id === s.activeProjectId) ?? s.projects[0];
}

export function getPreferences(): AppPreferences {
	return loadSettings().preferences;
}

export function isSetupCompleted(): boolean {
	return loadSettings().setupCompleted;
}

export function setSetupCompleted(done: boolean): void {
	const s = loadSettings();
	s.setupCompleted = done;
	saveSettings(s);
}

export function savePreferences(input: Partial<AppPreferences>): AppPreferences {
	const s = loadSettings();
	const next: AppPreferences = {
		uploadConvertAvif: input.uploadConvertAvif ?? s.preferences.uploadConvertAvif,
		closeAction: input.closeAction === "background" ? "background" : "exit",
		port: Number.isInteger(input.port) ? (input.port as number) : s.preferences.port,
		colorMode: input.colorMode === "dark" || input.colorMode === "system" ? input.colorMode : input.colorMode === "light" ? "light" : s.preferences.colorMode,
		blogMode:
			input.blogMode === "firefly" || input.blogMode === "mizuki"
				? input.blogMode
				: input.blogMode === "auto"
					? "auto"
					: s.preferences.blogMode,
	};
	s.preferences = next;
	saveSettings(s);
	return next;
}

/** 校验本地路径是否像一个博客项目（FireFly / Mizuki 皆可：配置目录或单文件布局均可） */
export function validateProjectPath(localPath: string): { ok: boolean; problems: string[] } {
	const problems: string[] = [];
	let stat: fs.Stats | null = null;
	try {
		stat = fs.statSync(localPath);
	} catch {
		/* ignore */
	}
	if (!stat || !stat.isDirectory()) {
		return { ok: false, problems: ["目录不存在或不是文件夹"] };
	}
	const has = (rel: string) => fs.existsSync(path.join(localPath, rel));
	// 配置：src/config/ 目录（FireFly / Mizuki v9+）或 src/config.ts 单文件（Mizuki v8.x）
	if (!has("src/config") && !has("src/config.ts")) {
		problems.push("缺少 src/config 目录或 src/config.ts");
	}
	if (!has("src/content")) problems.push("缺少 src/content 目录");
	if (!has("src/content/posts")) problems.push("缺少 src/content/posts 目录");
	return { ok: problems.length === 0, problems };
}

export function newProject(input: Partial<ProjectProfile>): ProjectProfile {
	return {
		id: randomUUID(),
		name: input.name?.trim() || "未命名项目",
		localPath: path.resolve(input.localPath || ""),
		remoteUrl: (input.remoteUrl || "").trim(),
		token: input.token || "",
		branch: input.branch?.trim() || "master",
		authorName: input.authorName || "",
		authorEmail: input.authorEmail || "",
		messageTemplate: input.messageTemplate || "feat: 更新博客内容",
	};
}
