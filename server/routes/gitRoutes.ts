import { Hono } from "hono";
import { getActiveProject } from "../settings.js";
import { gitStatus, gitCommit, gitPush, gitLog } from "../git/publish.js";

export const gitRoutes = new Hono()
	.get("/status", async (c) => {
		const project = getActiveProject();
		try {
			const status = await gitStatus(project);
			return c.json({ ...status, remoteConfigured: !!project.remoteUrl });
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
		}
	})
	.post("/commit", async (c) => {
		const project = getActiveProject();
		const body = (await c.req.json()) as { message: string };
		try {
			return c.json(await gitCommit(project, body.message || ""));
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
		}
	})
	.post("/push", async (c) => {
		const project = getActiveProject();
		try {
			return c.json(await gitPush(project));
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
		}
	})
	.get("/log", async (c) => {
		const project = getActiveProject();
		try {
			return c.json({ commits: await gitLog(project) });
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
		}
	});
