import fs from "node:fs";
import path from "node:path";
import { activeDirs, ensureInside } from "../paths.js";

/** spec 单页（about/guestbook/friends/site）：整文件源码编辑，保留 frontmatter 原样 */
export function listPages(): { file: string; name: string; ext: string }[] {
	const dir = activeDirs().specDir;
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir)
		.filter((f) => /\.(md|mdx)$/i.test(f))
		.map((f) => ({
			file: f,
			name: f.replace(/\.(md|mdx)$/i, ""),
			ext: path.extname(f).slice(1),
		}))
		.sort((a, b) => a.file.localeCompare(b.file));
}

function resolvePageFile(rel: string): string {
	const file = ensureInside(activeDirs().specDir, path.join(activeDirs().specDir, rel));
	if (!/\.(md|mdx)$/i.test(file)) throw new Error("只支持 md/mdx 文件");
	if (!fs.existsSync(file)) throw new Error("页面不存在");
	return file;
}

export function getPage(rel: string): { file: string; content: string } {
	return { file: rel, content: fs.readFileSync(resolvePageFile(rel), "utf-8") };
}

export function savePage(rel: string, content: string): void {
	if (typeof content !== "string") throw new Error("内容不能为空");
	fs.writeFileSync(resolvePageFile(rel), content, "utf-8");
}
