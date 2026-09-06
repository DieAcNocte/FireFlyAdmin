import { Hono } from "hono";
import {
	loadSettings,
	saveSettings,
	newProject,
	validateProjectPath,
	type ProjectProfile,
} from "../settings.js";

function maskToken(token: string): string {
	if (!token) return "";
	if (token.length <= 8) return "****";
	return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

export const projectRoutes = new Hono()
	.get("/", (c) => {
		const s = loadSettings();
		return c.json({
			activeProjectId: s.activeProjectId,
			projects: s.projects.map((p) => ({ ...p, token: maskToken(p.token), hasToken: !!p.token })),
		});
	})
	.post("/validate", async (c) => {
		const { localPath } = (await c.req.json()) as { localPath: string };
		return c.json(validateProjectPath(localPath || ""));
	})
	.post("/", async (c) => {
		const body = (await c.req.json()) as Partial<ProjectProfile>;
		const project = newProject(body);
		const v = validateProjectPath(project.localPath);
		if (!v.ok) return c.json({ error: `本地路径校验失败：${v.problems.join("；")}` }, 400);
		const s = loadSettings();
		if (s.projects.some((p) => p.localPath === project.localPath)) {
			return c.json({ error: "该本地路径已存在" }, 400);
		}
		s.projects.push(project);
		saveSettings(s);
		return c.json({ ok: true, id: project.id });
	})
	.put("/:id", async (c) => {
		const id = c.req.param("id");
		const body = (await c.req.json()) as Partial<ProjectProfile>;
		const s = loadSettings();
		const idx = s.projects.findIndex((p) => p.id === id);
		if (idx < 0) return c.json({ error: "项目不存在" }, 404);
		const old = s.projects[idx];
		const updated: ProjectProfile = {
			...old,
			name: body.name?.trim() || old.name,
			localPath: body.localPath ? body.localPath.trim() : old.localPath,
			remoteUrl: body.remoteUrl !== undefined ? body.remoteUrl.trim() : old.remoteUrl,
			token: body.token !== undefined && body.token !== "" ? body.token : old.token,
			branch: body.branch?.trim() || old.branch,
			authorName: body.authorName !== undefined ? body.authorName : old.authorName,
			authorEmail: body.authorEmail !== undefined ? body.authorEmail : old.authorEmail,
			messageTemplate: body.messageTemplate !== undefined ? body.messageTemplate : old.messageTemplate,
		};
		if (body.token === "__CLEAR__") updated.token = "";
		const v = validateProjectPath(updated.localPath);
		if (!v.ok) return c.json({ error: `本地路径校验失败：${v.problems.join("；")}` }, 400);
		s.projects[idx] = updated;
		saveSettings(s);
		return c.json({ ok: true });
	})
	.delete("/:id", (c) => {
		const id = c.req.param("id");
		const s = loadSettings();
		if (s.projects.length <= 1) return c.json({ error: "至少需要保留一个项目" }, 400);
		s.projects = s.projects.filter((p) => p.id !== id);
		if (s.activeProjectId === id) s.activeProjectId = s.projects[0].id;
		saveSettings(s);
		return c.json({ ok: true });
	})
	.post("/:id/activate", (c) => {
		const id = c.req.param("id");
		const s = loadSettings();
		if (!s.projects.some((p) => p.id === id)) return c.json({ error: "项目不存在" }, 404);
		s.activeProjectId = id;
		saveSettings(s);
		return c.json({ ok: true });
	});
