/**
 * 默认演示内容：把当前激活项目重置为"开箱参考"状态。
 * 仅作用于向导/用户明确确认的项目目录，不会主动触碰任何既有博客。
 */
import fs from "node:fs";
import path from "node:path";
import { activeDirs, ensureInside } from "../paths.js";
import { writePath } from "../config/ast.js";
import { nowInZone } from "../content/frontmatter.js";
import { getBlogTimezone } from "../content/posts.js";

function rmrf(dir: string): void {
	if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

/** 清空目录（保留目录本身） */
function clearDir(dir: string): void {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
		return;
	}
	for (const name of fs.readdirSync(dir)) rmrf(path.join(dir, name));
}

/** 生成默认演示文章（清空 posts 后写入一篇「测试」） */
export function generateDemoPosts(): string {
	const dirs = activeDirs();
	clearDir(dirs.postsDir);
	const tz = getBlogTimezone();
	const published = nowInZone(tz).slice(0, 10);
	const file = path.join(dirs.postsDir, "test.md");
	fs.writeFileSync(
		file,
		[
			"---",
			"title: 测试",
			`published: ${published}`,
			"description: 这是一篇演示文章，展示管理后台生成的默认格式。",
			"image: ''",
			"tags: [测试, 演示]",
			"category: 演示",
			"draft: false",
			"lang: ''",
			"slug: test",
			"---",
			"",
			"# 测试",
			"",
			"这是由 FireFly 管理后台生成的默认演示文章，用于参考文章的 frontmatter 格式。",
			"",
			"## 接下来你可以",
			"",
			"- 在后台「文章管理」中新建自己的文章",
			"- 使用「相册管理」「主页图片」管理图片内容",
			"- 在「发布」页把修改提交并推送到 GitHub",
			"",
		].join("\n"),
		"utf-8"
	);
	return "test.md";
}

/** 生成默认演示动态（清空 dynamic 后写入一条「测试」） */
export function generateDemoDynamic(): string {
	const dirs = activeDirs();
	clearDir(dirs.dynamicDir);
	const published = nowInZone(getBlogTimezone());
	const name = `${published.slice(0, 10)}-${published.slice(11, 13)}${published.slice(14, 16)}${published.slice(17, 19)}.md`;
	fs.writeFileSync(
		path.join(dirs.dynamicDir, name),
		`---\npublished: ${published}\n---\n\n这是一条由 FireFly 管理后台生成的演示动态。\n`,
		"utf-8"
	);
	return name;
}

/** 相册：只保留一个普通相册 + 一个加密相册 */
export function generateDemoAlbums(): void {
	const dirs = activeDirs();
	const file = path.join(dirs.configDir, "galleryConfig.ts");
	let code = fs.readFileSync(file, "utf-8");
	code = writePath(code, "galleryConfig", ["albums"], [
		{
			id: "demo",
			name: "演示相册",
			description: "这是一个普通演示相册，把图片放入 public/gallery/demo/ 即可展示。",
			location: "演示",
			date: nowInZone(getBlogTimezone()).slice(0, 10),
			tags: ["演示"],
		},
		{
			id: "demo-encrypted",
			name: "加密演示相册",
			description: "设置了访问密码的演示相册。",
			location: "演示",
			date: nowInZone(getBlogTimezone()).slice(0, 10),
			tags: ["演示", "加密"],
			password: "123456",
			passwordHint: "演示密码123456",
		},
	]);
	fs.writeFileSync(file, code, "utf-8");
	// 相册图片目录：只保留两个空目录
	rmrf(dirs.galleryDir);
	fs.mkdirSync(path.join(dirs.galleryDir, "demo"), { recursive: true });
	fs.mkdirSync(path.join(dirs.galleryDir, "demo-encrypted"), { recursive: true });
}

/** 主页图片：桌面只保留 D01，移动只保留 M01 */
export function generateDemoWallpapers(): void {
	const dirs = activeDirs();
	const file = path.join(dirs.configDir, "backgroundWallpaper.ts");
	let code = fs.readFileSync(file, "utf-8");
	code = writePath(code, "backgroundWallpaper", ["src", "desktop"], ["assets/images/DesktopWallpaper/D01.avif"]);
	code = writePath(code, "backgroundWallpaper", ["src", "mobile"], ["assets/images/MobileWallpaper/M01.avif"]);
	fs.writeFileSync(file, code, "utf-8");
}

/** 一步到位：恢复全部默认演示内容 */
export function generateAllDemoContent(): { post: string; dynamic: string } {
	const dirs = activeDirs();
	// 博客目录必须是已配置的有效项目
	if (!fs.existsSync(dirs.configDir)) throw new Error("当前项目路径无效");
	const post = generateDemoPosts();
	const dynamic = generateDemoDynamic();
	generateDemoAlbums();
	generateDemoWallpapers();
	void ensureInside;
	return { post, dynamic };
}
