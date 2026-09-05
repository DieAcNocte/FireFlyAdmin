import { Hono } from "hono";
import {
	listPosts,
	getPost,
	createPost,
	updatePost,
	deletePost,
} from "../content/posts.js";
import {
	listDynamics,
	getDynamic,
	createDynamic,
	updateDynamic,
	deleteDynamic,
} from "../content/dynamics.js";
import { listPages, getPage, savePage } from "../content/pages.js";

export const contentRoutes = new Hono()
	// ── 文章 ──
	.get("/posts", (c) => c.json({ posts: listPosts() }))
	.get("/posts/detail", (c) => {
		const file = c.req.query("file") || "";
		return c.json(getPost(file));
	})
	.post("/posts", async (c) => {
		const body = await c.req.json();
		return c.json(createPost(body));
	})
	.put("/posts", async (c) => {
		const file = c.req.query("file") || "";
		const body = await c.req.json();
		return c.json(updatePost(file, body));
	})
	.delete("/posts", (c) => {
		const file = c.req.query("file") || "";
		deletePost(file);
		return c.json({ ok: true });
	})
	// ── 动态 ──
	.get("/dynamics", (c) => c.json({ dynamics: listDynamics() }))
	.get("/dynamics/detail", (c) => {
		const file = c.req.query("file") || "";
		return c.json(getDynamic(file));
	})
	.post("/dynamics", async (c) => {
		const body = await c.req.json();
		return c.json(createDynamic(body));
	})
	.put("/dynamics", async (c) => {
		const file = c.req.query("file") || "";
		const body = await c.req.json();
		return c.json(updateDynamic(file, body));
	})
	.delete("/dynamics", (c) => {
		const file = c.req.query("file") || "";
		deleteDynamic(file);
		return c.json({ ok: true });
	})
	// ── spec 页面 ──
	.get("/pages", (c) => c.json({ pages: listPages() }))
	.get("/pages/detail", (c) => {
		const file = c.req.query("file") || "";
		return c.json(getPage(file));
	})
	.put("/pages", async (c) => {
		const file = c.req.query("file") || "";
		const body = (await c.req.json()) as { content: string };
		savePage(file, body.content);
		return c.json({ ok: true });
	});
