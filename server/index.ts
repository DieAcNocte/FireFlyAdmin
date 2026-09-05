import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { ROOT_DIR, getPreferences, savePreferences } from "./settings.js";
import { projectRoutes } from "./routes/projects.js";
import { contentRoutes } from "./routes/content.js";
import { galleryRoutes } from "./routes/gallery.js";
import { mediaRoutes } from "./routes/media.js";
import { configRoutes } from "./config/routes.js";
import { gitRoutes } from "./routes/gitRoutes.js";
import { blogRoutes } from "./routes/blogRoutes.js";

const SEA_BUILD = typeof __SEA_BUILD !== "undefined" && __SEA_BUILD === "true";

/** SEA 模式下前端资源内嵌在 EXE 中，通过 node:sea 读取（main 内初始化） */
let seaApi: { getRawAsset(key: string): ArrayBuffer } | null = null;

function readSeaAsset(key: string): Buffer | null {
	if (!seaApi) return null;
	try {
		return Buffer.from(seaApi.getRawAsset(key));
	} catch {
		return null;
	}
}

const app = new Hono();

app.onError((err, c) => {
	console.error("[api error]", err);
	return c.json({ error: err.message || "服务器内部错误" }, 500);
});

app.route("/api/projects", projectRoutes);
app.route("/api/configs", configRoutes);
app.route("/api/gallery", galleryRoutes);
app.route("/api/git", gitRoutes);
app.route("/api/blog", blogRoutes);
app.route("/api", contentRoutes);
app.route("/api", mediaRoutes);

app.get("/api/health", (c) => c.json({ ok: true, time: Date.now() }));

// ── 应用设置 / 运行时控制 ──
app.get("/api/app/preferences", (c) => c.json(getPreferences()));
app.put("/api/app/preferences", async (c) => {
	const body = (await c.req.json()) as {
		uploadConvertAvif?: boolean;
		closeAction?: "exit" | "background";
		port?: number;
	};
	if (body.port !== undefined) {
		const port = Number(body.port);
		if (!Number.isInteger(port) || port < 1024 || port > 65535) {
			return c.json({ error: "端口需为 1024-65535 之间的整数" }, 400);
		}
	}
	return c.json({ ok: true, preferences: savePreferences(body) });
});
app.get("/api/app/runtime", (c) =>
	c.json({
		sea: SEA_BUILD,
		pid: process.pid,
		port: PORT,
		closeAction: getPreferences().closeAction,
	})
);
app.post("/api/app/stop", (c) => {
	if (!SEA_BUILD) {
		return c.json({ error: "仅对 EXE 启动方式有效（当前为脚本模式，请直接结束进程）" }, 400);
	}
	setTimeout(() => process.exit(0), 200);
	return c.json({ ok: true });
});

// 未匹配的 API 路径返回 JSON 404（而不是回退到 SPA）
app.all("/api/*", (c) => c.json({ error: "接口不存在" }, 404));

// 前端托管：优先磁盘 dist/（开发模式），SEA 模式回退到内嵌资源（SPA 回退到 index.html）
const DIST = path.join(ROOT_DIR, "dist");
const MIME: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
};

app.get("*", (c) => {
	const urlPath = decodeURIComponent(c.req.path);
	const rel = urlPath.replace(/^\/+/, "");
	let filePath = path.join(DIST, rel);
	if (!filePath.startsWith(DIST)) return c.text("Forbidden", 403);
	if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
		filePath = path.join(DIST, "index.html");
	}
	let data: Buffer | null = null;
	let mime: string | undefined;
	if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
		data = fs.readFileSync(filePath);
		mime = MIME[path.extname(filePath).toLowerCase()];
	} else if (seaApi) {
		const key = "dist/" + (rel || "index.html");
		data = readSeaAsset(key) ?? readSeaAsset("dist/index.html");
		mime = MIME[path.extname(rel.split("?")[0] || ".html").toLowerCase()] ?? "text/html; charset=utf-8";
	}
	if (!data) {
		return c.text("前端资源未找到：请先运行 pnpm build（开发模式请访问 http://localhost:5176）", 404);
	}
	return c.body(new Uint8Array(data), 200, { "Content-Type": mime ?? "application/octet-stream" });
});

let PORT = 5175;

async function main() {
	if (SEA_BUILD) {
		try {
			seaApi = (await import("node:sea")) as unknown as { getRawAsset(key: string): ArrayBuffer };
		} catch {
			seaApi = null;
		}
		// EXE 模式：关闭控制台窗口时可选择转入后台继续运行（在窗口关闭的宽限期内重启一个无窗口的分离进程）
		process.on("SIGHUP", () => {
			try {
				if (getPreferences().closeAction === "background") {
					spawn(process.execPath, [], {
						detached: true,
						stdio: "ignore",
						windowsHide: true,
						env: { ...process.env, NO_OPEN: "1" },
					}).unref();
				}
			} catch {
				/* ignore */
			}
			process.exit(0);
		});
	}
	PORT = Number(process.env.PORT || getPreferences().port || 5175);
	serve({ fetch: app.fetch, hostname: "127.0.0.1", port: PORT }, (info) => {
		console.log(`[firefly-admin] 管理后台已启动: http://127.0.0.1:${info.port}`);
		// 双击 EXE 启动时自动打开浏览器
		if (SEA_BUILD && process.env.NO_OPEN !== "1") {
			const url = `http://127.0.0.1:${info.port}`;
			if (process.platform === "win32") {
				spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
			} else {
				spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
			}
		}
	});
}

main();
