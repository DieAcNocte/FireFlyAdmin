import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { getActiveProject } from "../settings.js";
import { startDev, stopDev, devStatus } from "../blog/dev.js";
import { listPosts } from "../content/posts.js";
import { listDynamics } from "../content/dynamics.js";
import { readPath } from "../config/ast.js";
import { activeDirs } from "../paths.js";
import { activeCapabilities } from "../theme.js";
import { gitStatus } from "../git/publish.js";

export const blogRoutes = new Hono()
	// 仪表盘总览
	.get("/overview", async (c) => {
		const project = getActiveProject();
		const dirs = activeDirs();
		const caps = activeCapabilities();
		let albums = 0;
		try {
			if (caps.gallery === "scanner") {
				const base = dirs.albumsDir;
				if (fs.existsSync(base)) {
					albums = fs
						.readdirSync(base, { withFileTypes: true })
						.filter((d) => d.isDirectory() && fs.existsSync(path.join(base, d.name, "info.json"))).length;
				}
			} else {
				const code = fs.readFileSync(path.join(dirs.configDir, "galleryConfig.ts"), "utf-8");
				const r = readPath(code, "galleryConfig", ["albums"]);
				if (r.found && Array.isArray(r.value)) albums = r.value.length;
			}
		} catch {
			/* ignore */
		}
		let git = null;
		try {
			const st = await gitStatus(project);
			git = { branch: st.branch, changed: st.files.length, ahead: st.ahead, behind: st.behind };
		} catch {
			git = null;
		}
		const countFiles = (dir: string, test: (f: string) => boolean) => {
			try {
				return fs.readdirSync(dir).filter((f) => test(f)).length;
			} catch {
				return 0;
			}
		};
		const isMizuki = caps.wallpaper === "mizuki";
		const mizukiSingle = isMizuki && caps.configLayout === "single";
		return c.json({
			project: { id: project.id, name: project.name, localPath: project.localPath, remoteUrl: project.remoteUrl, branch: project.branch },
			theme: caps.theme,
			counts: {
				posts: listPosts().length,
				dynamics: listDynamics().length,
				albums,
				desktopWallpapers: countFiles(mizukiSingle ? dirs.publicImagesDir : isMizuki ? dirs.bannerDesktopDir : dirs.desktopWallpaperDir, (f) => /\.(avif|webp|png|jpe?g|gif)$/i.test(f)),
				mobileWallpapers: countFiles(mizukiSingle ? dirs.publicImagesDir : isMizuki ? dirs.bannerMobileDir : dirs.mobileWallpaperDir, (f) => /\.(avif|webp|png|jpe?g|gif)$/i.test(f)),
			},
			git,
			dev: devStatus(),
		});
	})
	.post("/dev", async (c) => {
		const body = (await c.req.json()) as { action: "start" | "stop" };
		const project = getActiveProject();
		if (body.action === "start") return c.json(startDev(project));
		return c.json(stopDev());
	})
	.get("/dev", (c) => c.json(devStatus()));
