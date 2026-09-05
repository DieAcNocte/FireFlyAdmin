/**
 * AST 引擎往返测试：对真实配置文件的副本做 读→写→比对。
 * 运行：npx tsx scripts/test-ast.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPath, writePath } from "../server/config/ast.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "../data/tmp-fixture/config");
const BLOG_CONFIG = "D:\\Documents\\ZcodeProject\\Yoimiya\\src\\config";

let failed = 0;
function check(name: string, cond: boolean, detail = "") {
	if (cond) console.log(`  ✓ ${name}`);
	else {
		failed++;
		console.error(`  ✗ ${name} ${detail}`);
	}
}

function load(file: string): string {
	return fs.readFileSync(path.join(FIXTURE, file), "utf-8");
}

// ── 1. galleryConfig：albums 读写 ──
console.log("\n[galleryConfig]");
{
	const code = load("galleryConfig.ts");
	const albums = readPath(code, "galleryConfig", ["albums"]);
	check("读到 3 个相册", albums.found && Array.isArray(albums.value) && (albums.value as unknown[]).length === 3);
	check("相册 id 正确", (albums.value as { id: string }[])?.[0]?.id === "phone-wallpapers");
	const cw = readPath(code, "galleryConfig", ["columnWidth"]);
	check("columnWidth = 240", cw.value === 240);

	// 幂等：原样写回应保持不变
	const idempotent = writePath(code, "galleryConfig", ["albums"], albums.value);
	check("albums 原样写回 → 文件不变", idempotent === code);

	// 修改：改第一个相册名称、给第二个加密码、删除密码提示字段（null = 删除）、新增相册
	const next = JSON.parse(JSON.stringify(albums.value)) as Record<string, unknown>[];
	next[0].name = "手机壁纸改";
	next[1].password = "abc123";
	next[2].passwordHint = null;
	next.push({ id: "test-new", name: "测试相册", description: "", location: "测试", date: "2026-09-05", tags: ["测试"] });
	const modified = writePath(code, "galleryConfig", ["albums"], next);
	check("保留文档注释", modified.includes("相册唯一标识符"));
	check("名称已修改", modified.includes("手机壁纸改"));
	check("新密码已写入", modified.includes('password: "abc123"'));
	check("passwordHint 字段已移除", !modified.includes('passwordHint: "示例密码123456"'));
	check("新相册已追加", modified.includes('id: "test-new"'));
	// 写回后可再次读取且结构正确
	const reread = readPath(modified, "galleryConfig", ["albums"]);
	check("修改后重新读取得到 4 个相册", (reread.value as unknown[])?.length === 4);

	// columnWidth 标量替换
	const cwNew = writePath(code, "galleryConfig", ["columnWidth"], 300);
	check("columnWidth 已替换", cwNew.includes("columnWidth: 300") && cwNew.includes("相册配置"));
}

// ── 2. siteConfig：标量 / 数组 / 嵌套 ──
console.log("\n[siteConfig]");
{
	const code = load("siteConfig.ts");
	check("title 读取", readPath(code, "siteConfig", ["title"]).value === "硝华流焰");
	check("hue 读取", readPath(code, "siteConfig", ["themeColor", "hue"]).value === 25);
	check("postsPerPage 读取", readPath(code, "siteConfig", ["pagination", "postsPerPage"]).value !== undefined);
	const kw = readPath(code, "siteConfig", ["keywords"]);
	check("keywords 数组 8 项", Array.isArray(kw.value) && (kw.value as unknown[]).length === 8);

	const idem = writePath(code, "siteConfig", ["keywords"], kw.value);
	check("keywords 原样写回 → 文件不变", idem === code);

	const t = writePath(code, "siteConfig", ["title"], "新标题测试");
	check("title 已替换且注释保留", t.includes('title: "新标题测试"') && t.includes("站点标题"));

	const hue = writePath(code, "siteConfig", ["themeColor", "hue"], 100);
	check("嵌套 hue 已替换", hue.includes("hue: 100"));
	check("pages 局部变量保留", hue.includes("resolvePageToggles"));
	check("SITE_LANG 保留", hue.includes("resolveSiteLang"));

	const kw2 = writePath(code, "siteConfig", ["keywords"], ["a", "b", "c"]);
	const reread = readPath(kw2, "siteConfig", ["keywords"]);
	check("keywords 替换后重新读取正确", JSON.stringify(reread.value) === JSON.stringify(["a", "b", "c"]));
}

// ── 3. backgroundWallpaper：数组 + 嵌套对象 ──
console.log("\n[backgroundWallpaper]");
{
	const code = load("backgroundWallpaper.ts");
	const desktop = readPath(code, "backgroundWallpaper", ["src", "desktop"]);
	check("desktop 壁纸 14 张", Array.isArray(desktop.value) && (desktop.value as unknown[]).length === 14);
	const subtitle = readPath(code, "backgroundWallpaper", ["common", "homeText", "subtitle"]);
	check("副标题 4 行", Array.isArray(subtitle.value) && (subtitle.value as unknown[]).length === 4);
	const links = readPath(code, "backgroundWallpaper", ["common", "homeText", "links"]);
	check("横幅链接 3 个", Array.isArray(links.value) && (links.value as unknown[]).length === 3);

	const idemD = writePath(code, "backgroundWallpaper", ["src", "desktop"], desktop.value);
	check("desktop 原样写回 → 文件不变", idemD === code);
	const idemL = writePath(code, "backgroundWallpaper", ["common", "homeText", "links"], links.value);
	check("links 原样写回 → 文件不变", idemL === code);

	const fewer = writePath(code, "backgroundWallpaper", ["src", "desktop"], (desktop.value as string[]).slice(0, 3));
	const reread = readPath(fewer, "backgroundWallpaper", ["src", "desktop"]);
	check("desktop 截取为 3 张", (reread.value as unknown[])?.length === 3);
	check("mobile 不受影响", (readPath(fewer, "backgroundWallpaper", ["src", "mobile"]).value as unknown[])?.length === 13);
	check("homeText.title 保留", fewer.includes("Love Yoimiya"));
}

// ── 4. profileConfig：对象数组可选字段合并 ──
console.log("\n[profileConfig]");
{
	const code = load("profileConfig.ts");
	const links = readPath(code, "profileConfig", ["links"]);
	const items = links.value as Record<string, unknown>[];
	check("profile links 3 个", items.length === 3);
	check("showName 读出为 false", items[0].showName === false);

	const idem = writePath(code, "profileConfig", ["links"], items);
	check("links 原样写回 → 文件不变", idem === code);

	// 新增链接（无 showName → 键不出现）
	const next = [...items, { name: "RSS", icon: "mdi:rss", url: "/rss.xml" }];
	const added = writePath(code, "profileConfig", ["links"], next);
	const reread = readPath(added, "profileConfig", ["links"]);
	const rereadItems = reread.value as Record<string, unknown>[];
	check("新增后 4 个", rereadItems.length === 4);
	check("新链接没有 showName 键", !added.includes("mdi:rss") || !/mdi:rss[\s\S]{0,80}showName/.test(added));
}

console.log(failed === 0 ? "\n全部通过 ✔" : `\n${failed} 个用例失败 ✘`);
process.exit(failed === 0 ? 0 : 1);
