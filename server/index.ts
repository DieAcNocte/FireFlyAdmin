import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { ROOT_DIR } from "./settings.js";
import { projectRoutes } from "./routes/projects.js";
import { contentRoutes } from "./routes/content.js";
import { galleryRoutes } from "./routes/gallery.js";
import { mediaRoutes } from "./routes/media.js";
import { configRoutes } from "./config/routes.js";
import { gitRoutes } from "./routes/gitRoutes.js";
import { blogRoutes } from "./routes/blogRoutes.js";

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

// 未匹配的 API 路径返回 JSON 404（而不是回退到 SPA）
app.all("/api/*", (c) => c.json({ error: "接口不存在" }, 404));

// 生产模式：托管前端构建产物（SPA 回退到 index.html）
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
	let filePath = path.join(DIST, urlPath.replace(/^\/+/, ""));
	if (!filePath.startsWith(DIST)) return c.text("Forbidden", 403);
	if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
		filePath = path.join(DIST, "index.html");
	}
	if (!fs.existsSync(filePath)) {
		return c.text("前端尚未构建，请先运行 pnpm build（开发模式请访问 http://localhost:5176）", 404);
	}
	const mime = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
	return c.body(fs.readFileSync(filePath), 200, { "Content-Type": mime });
});

const PORT = Number(process.env.PORT || 5175);
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: PORT }, (info) => {
	console.log(`[firefly-admin] API 服务已启动: http://127.0.0.1:${info.port}`);
});
