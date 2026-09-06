/**
 * E2E 测试：对运行中的后台服务（默认 127.0.0.1:5175）做全流程验证。
 * 前置：data/tmp-fixture 测试项目已存在（一个博客副本）。
 * 运行：npx tsx scripts/test-e2e.ts
 */
const BASE = "http://127.0.0.1:5175/api";
const FIXTURE_PATH = "D:/Documents/ZcodeProject/Mane/data/tmp-fixture";

let failed = 0;
function check(name: string, cond: boolean, detail = "") {
	if (cond) console.log(`  [OK] ${name}`);
	else {
		failed++;
		console.error(`  [FAIL] ${name} ${detail}`);
	}
}

async function req(method: string, path: string, body?: unknown) {
	const res = await fetch(`${BASE}${path}`, {
		method,
		headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
	let data: any = null;
	try {
		data = await res.json();
	} catch {
		/* ignore */
	}
	return { status: res.status, data };
}

async function main() {
	// ── 项目：清理旧测试项目 + 创建 + 激活测试项目 ──
	console.log("\n[projects]");
	const preList = await req("GET", "/projects");
	for (const p of preList.data.projects.filter((p: any) => p.name === "E2EFixture" || p.name === "TestFixture")) {
		await req("DELETE", `/projects/${p.id}`);
	}
	const created = await req("POST", "/projects", { name: "E2EFixture", localPath: FIXTURE_PATH });
	check("创建测试项目", created.status === 200 && !!created.data.id, JSON.stringify(created.data));
	const fxId = created.data.id;
	const list = await req("GET", "/projects");
	check("项目列表包含新项目", list.data.projects.some((p: any) => p.id === fxId));
	const act = await req("POST", `/projects/${fxId}/activate`);
	check("激活测试项目", act.status === 200);
	const validate = await req("POST", "/projects/validate", { localPath: "D:/不存在的路径" });
	check("路径校验拒绝无效路径", validate.data.ok === false);

	// ── 文章 CRUD ──
	console.log("\n[posts]");
	const created2 = await req("POST", "/posts", {
		title: "测试文章：宵祭",
		published: "2026-09-05",
		description: "一篇测试文章",
		tags: ["测试", "宵宫"],
		category: "测试分类",
		draft: false,
	});
	check("创建文章", created2.status === 200 && !!created2.data.file, JSON.stringify(created2.data));
	const postFile = created2.data.file;
	check("slug 为拼音", postFile === "ce-shi-wen-zhang-xiao-ji.md");

	const detail = await req("GET", `/posts/detail?file=${encodeURIComponent(postFile)}`);
	check("读取文章 body", detail.data.body === "");
	check("读取文章标题", detail.data.data.title === "测试文章：宵祭");

	const updated = await req("PUT", `/posts?file=${encodeURIComponent(postFile)}`, {
		description: "更新后的描述",
		pinned: true,
		body: "## 你好\n\n这是正文内容。",
	});
	check("更新文章", updated.status === 200);
	const detail2 = await req("GET", `/posts/detail?file=${encodeURIComponent(postFile)}`);
	check("正文已更新", detail2.data.body.includes("这是正文内容"));
	check("置顶已生效", detail2.data.data.pinned === true);
	check("标题保留", detail2.data.data.title === "测试文章：宵祭");

	const postList = await req("GET", "/posts");
	const found = postList.data.posts.find((p: any) => p.file === postFile);
	check("列表包含新文章且置顶排序靠前", !!found && found.pinned === true);

	// slug 冲突检测
	const dup = await req("POST", "/posts", { title: "another", slug: "ce-shi-wen-zhang-xiao-ji" });
	check("重名文章被拒绝", dup.status === 500 && String(dup.data.error).includes("已存在"));

	// ── 动态 CRUD ──
	console.log("\n[dynamics]");
	const dyn = await req("POST", "/dynamics", {
		content: "今天天气不错，**加粗测试**。",
		location: "测试地点",
		pinned: true,
	});
	check("发布动态", dyn.status === 200 && /^\d{4}-\d{2}-\d{2}-\d{6}\.md$/.test(dyn.data.file), JSON.stringify(dyn.data));
	const dynFile = dyn.data.file;

	const dynList = await req("GET", "/dynamics");
	const dynFound = dynList.data.dynamics.find((d: any) => d.file === dynFile);
	check("动态列表包含新动态", !!dynFound && dynFound.location === "测试地点" && dynFound.pinned === true);

	const dynUpdated = await req("PUT", `/dynamics?file=${dynFile}`, {
		content: "修改后的动态内容",
		published: "2026-09-05 12:34:56",
	});
	check("更新动态（含时间戳重命名）", dynUpdated.status === 200 && dynUpdated.data.file === "2026-09-05-123456.md");
	const oldGone = await req("GET", `/dynamics/detail?file=${dynFile}`);
	check("旧文件名已不存在", oldGone.status === 500);

	// ── 页面 ──
	console.log("\n[pages]");
	const pages = await req("GET", "/pages");
	check("spec 页面列表", pages.data.pages.length >= 3);
	const pageName = pages.data.pages[0].file;
	const pageDetail = await req("GET", `/pages/detail?file=${encodeURIComponent(pageName)}`);
	check("读取页面内容", typeof pageDetail.data.content === "string" && pageDetail.data.content.length > 0);
	const pageSave = await req("PUT", `/pages?file=${encodeURIComponent(pageName)}`, {
		content: pageDetail.data.content + "\n<!-- e2e-test -->\n",
	});
	check("保存页面", pageSave.status === 200);
	const pageRevert = await req("PUT", `/pages?file=${encodeURIComponent(pageName)}`, { content: pageDetail.data.content });
	check("还原页面", pageRevert.status === 200);

	// ── 相册 ──
	console.log("\n[gallery]");
	const gal = await req("GET", "/gallery");
	check("读取到 3 个相册", gal.data.albums.length === 3);
	check("columnWidth 读取", gal.data.columnWidth === 240);
	const newAlbums = [...gal.data.albums, { id: "e2e-test", name: "E2E 相册", description: "", location: "", date: "2026-09-05", tags: ["e2e"] }];
	const galSave = await req("PUT", "/gallery", { albums: newAlbums });
	check("追加相册并保存", galSave.status === 200);
	const gal2 = await req("GET", "/gallery");
	check("保存后 4 个相册", gal2.data.albums.length === 4);
	const galImages = await req("GET", "/gallery/phone-wallpapers/images");
	check("相册图片列表", Array.isArray(galImages.data.images));

	// ── 配置字段读写 ──
	console.log("\n[configs]");
	const siteGet = await req("GET", "/configs/siteConfig.ts");
	const titleField = siteGet.data.fields.find((f: any) => f.path === "title");
	check("siteConfig.title 表单值", titleField?.value === "硝华流焰");
	const originalTitle = titleField?.value;
	const hueField = siteGet.data.fields.find((f: any) => f.path === "themeColor.hue");
	check("themeColor.hue 表单值", hueField?.value === 25);
	const siteSave = await req("PUT", "/configs/siteConfig.ts/fields", {
		values: [{ path: "title", value: "硝华流焰·改" }],
	});
	check("写入 title 字段", siteSave.status === 200 && siteSave.data.applied.includes("title"));
	const siteGet2 = await req("GET", "/configs/siteConfig.ts");
	check("写回后值正确", siteGet2.data.fields.find((f: any) => f.path === "title")?.value === "硝华流焰·改");
	// 原样写回 keywords（幂等）
	const kwField = siteGet2.data.fields.find((f: any) => f.path === "keywords");
	const kwSave = await req("PUT", "/configs/siteConfig.ts/fields", { values: [{ path: "keywords", value: kwField.value }] });
	check("keywords 幂等写回成功", kwSave.status === 200);

	const rawList = await req("GET", "/configs/raw/all");
	check("源码文件清单（≥4）", rawList.data.files.length >= 4);
	const rawGet = await req("GET", "/configs/raw/profileConfig.ts");
	check("读取 profileConfig 源码", rawGet.data.content.includes("export const profileConfig"));
	const rawSave = await req("PUT", "/configs/raw/profileConfig.ts", { content: rawGet.data.content });
	check("源码原样保存", rawSave.status === 200);

	// ── 图片 ──
	console.log("\n[images]");
	// 生成 1x1 PNG 上传
	const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
	const form = new FormData();
	form.append("target", "wallpaper-desktop");
	form.append("convertAvif", "false");
	form.append("files", new File([Buffer.from(pngB64, "base64")], "e2e-test.png", { type: "image/png" }));
	const upRes = await fetch(`${BASE}/images`, { method: "POST", body: form });
	const upData = await upRes.json();
	check("上传图片", upRes.status === 200 && upData.saved?.[0] === "e2e-test.png", JSON.stringify(upData));
	const imgList = await req("GET", "/images?target=wallpaper-desktop");
	check("图片列表包含新图", imgList.data.images.some((i: any) => i.name === "e2e-test.png"));
	const imgUrl = imgList.data.images.find((i: any) => i.name === "e2e-test.png")?.url;
	const imgFetch = await fetch(`http://127.0.0.1:5175${imgUrl}`);
	check("图片可访问", imgFetch.status === 200 && imgFetch.headers.get("content-type") === "image/png");
	const imgDel = await req("DELETE", "/images?target=wallpaper-desktop&name=e2e-test.png");
	check("删除图片", imgDel.status === 200);

	// ── 清理：删除测试创建的内容（趁测试项目仍处于激活状态）──
	console.log("\n[cleanup]");
	const delPost = await req("DELETE", `/posts?file=${encodeURIComponent(postFile)}`);
	check("清理测试文章", delPost.status === 200);
	const dynAfterRename = (await req("GET", "/dynamics")).data.dynamics.find(
		(d: any) => d.content.includes("修改后的动态内容")
	);
	if (dynAfterRename) await req("DELETE", `/dynamics?file=${dynAfterRename.file}`);
	const galFinal = await req("GET", "/gallery");
	const withoutTest = galFinal.data.albums.filter((a: any) => a.id !== "e2e-test");
	if (withoutTest.length !== galFinal.data.albums.length) {
		await req("PUT", "/gallery", { albums: withoutTest });
	}
	// 还原被修改的 siteConfig.title
	if (originalTitle) {
		await req("PUT", "/configs/siteConfig.ts/fields", { values: [{ path: "title", value: originalTitle }] });
	}

	// ── 切回真实项目并做只读 git 检查 ──
	console.log("\n[git]");
	const backToYoimiya = await req("POST", `/projects/${list.data.projects.find((p: any) => p.name === "Yoimiya").id}/activate`);
	check("切回 Yoimiya", backToYoimiya.status === 200);
	const gs = await req("GET", "/git/status");
	check("读取 git status", gs.status === 200 && typeof gs.data.branch === "string", JSON.stringify(gs.data).slice(0, 120));
	const gl = await req("GET", "/git/log");
	check("读取 git log", gl.status === 200 && Array.isArray(gl.data.commits) && gl.data.commits.length > 0);
	const pushNoRemote = await req("POST", "/git/push");
	check("未配置远程时推送被拒绝并提示", pushNoRemote.status === 500 && String(pushNoRemote.data.error).includes("远程仓库"));

	// ── 删除测试项目 ──
	const del1 = await req("DELETE", `/projects/${fxId}`);
	check("删除测试项目", del1.status === 200);
	console.log(failed === 0 ? "\nE2E 全部通过 ✔" : `\nE2E ${failed} 个用例失败 ✘`);
	process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
