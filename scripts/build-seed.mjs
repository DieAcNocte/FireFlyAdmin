/**
 * 生成手机 App 内置的 FireFly 模板快照（public/seed/）：
 * - 文本内容：从 jsDelivr CDN 拉取上游仓库（CuteLeaf/Firefly@master）的 src/ 文件
 * - 图片资源：上游的文章配图（CDN）+ 本地博客克隆的壁纸/相册图片（上游不含壁纸图片）
 * 连同 manifest.json 一起写入 public/seed/，随前端构建进入安卓 APK 资产，
 * 使 App 在离线/未配置状态下也能完整预览模板内容。
 *
 * 用法：node scripts/build-seed.mjs
 * 本地博客克隆路径可用环境变量 LOCAL_BLOG 覆盖（默认 D:/Documents/ZcodeProject/Test）。
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const REPO = "CuteLeaf/Firefly";
const BRANCH = "master";
const OUT = "public/seed";
const TREE_CACHE = "local/tmp/ff-flat.json";
const LOCAL_BLOG = process.env.LOCAL_BLOG || "D:/Documents/ZcodeProject/Test";
const MAX_FILE = 2 * 1024 * 1024;
const MAX_TOTAL = 12 * 1024 * 1024;
const TEXT_EXT = /\.(tsx?|md|mdx|json|mjs|js|css|ya?ml)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
const CDNS = ["https://cdn.jsdelivr.net", "https://fastly.jsdelivr.net", "https://gcore.jsdelivr.net"];

const tree = JSON.parse(fs.readFileSync(TREE_CACHE, "utf8"));
const picks = tree.files.filter(
	(f) =>
		f.name.startsWith("/src/") &&
		(TEXT_EXT.test(f.name) || (IMAGE_EXT.test(f.name) && f.name.startsWith("/src/content/posts/images/"))) &&
		f.size <= MAX_FILE
);
picks.push(
	...tree.files.filter((f) => f.name === "/scripts/new-dynamic.js"),
	// 相册外链照片清单：上游相册（如 firefly-2026/encrypted-test）的照片来自 urls.txt 外链
	...tree.files.filter((f) => f.name.startsWith("/public/gallery/") && f.name.endsWith("urls.txt") && f.size <= MAX_FILE)
);
picks.sort((a, b) => a.name.localeCompare(b.name));

const entries = new Map(); // path → {path, size}
let total = 0;
const failed = [];

function record(rel, size) {
	if (total - (entries.get(rel)?.size ?? 0) + size > MAX_TOTAL) {
		console.log("skip(总大小超限)", rel);
		return false;
	}
	total += size - (entries.get(rel)?.size ?? 0);
	entries.set(rel, { path: rel, size });
	return true;
}

// ── 上游 CDN：src/ 文本 + 文章配图（本地克隆有同路径文件时优先用本地，离线且内容一致）──
for (const f of picks) {
	const rel = f.name.replace(/^\//, "");
	if (!record(rel, f.size)) continue;
	const dest = path.join(OUT, rel);
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	const localFull = path.join(LOCAL_BLOG, rel);
	if (fs.existsSync(localFull)) {
		fs.copyFileSync(localFull, dest);
		continue;
	}
	let ok = false;
	for (const cdn of CDNS) {
		try {
			const res = await fetch(`${cdn}/gh/${REPO}@${BRANCH}${f.name}`);
			if (!res.ok) continue;
			fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
			ok = true;
			break;
		} catch {
			/* 换下一个 CDN */
		}
	}
	if (!ok) {
		failed.push(f.name);
		entries.delete(rel);
		total -= f.size;
	}
}

// ── 本地博客克隆：壁纸与相册图片（上游仓库不含这些二进制）──
function walkLocal(dir) {
	const out = [];
	if (!fs.existsSync(dir)) return out;
	for (const name of fs.readdirSync(dir)) {
		const full = path.join(dir, name);
		if (fs.statSync(full).isDirectory()) out.push(...walkLocal(full));
		else out.push(full);
	}
	return out;
}

for (const d of ["src/assets/images", "public/gallery", "src/content/posts/images", "src/content/dynamic"]) {
	for (const full of walkLocal(path.join(LOCAL_BLOG, d))) {
		const st = fs.statSync(full);
		if (st.size > MAX_FILE) continue;
		if (!IMAGE_EXT.test(full) && !TEXT_EXT.test(full) && !(d === "public/gallery" && /\.txt$/i.test(full))) continue;
		const rel = path.relative(LOCAL_BLOG, full).split(path.sep).join("/");
		if (!record(rel, st.size)) continue;
		const dest = path.join(OUT, rel);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(full, dest);
	}
}

// ── 本地博客克隆的配置文件全量打包（上游可能已移除，如 galleryConfig.ts）──
for (const d of ["src/config", "src/data"]) {
	for (const full of walkLocal(path.join(LOCAL_BLOG, d))) {
		const st = fs.statSync(full);
		if (st.size > MAX_FILE || !TEXT_EXT.test(full)) continue;
		const rel = path.relative(LOCAL_BLOG, full).split(path.sep).join("/");
		if (!record(rel, st.size)) continue;
		const dest = path.join(OUT, rel);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(full, dest);
	}
}

// ── AVIF → WebP：部分安卓 WebView 不支持 AVIF 解码，WebP 全版本支持 ──
for (const full of walkLocal(OUT)) {
	if (!/\.avif$/i.test(full)) continue;
	const outPath = full.replace(/\.avif$/i, ".webp");
	const buf = await sharp(full).webp({ quality: 85 }).toBuffer();
	fs.writeFileSync(outPath, buf);
	fs.rmSync(full);
	const relOld = path.relative(OUT, full).split(path.sep).join("/");
	const relNew = relOld.replace(/\.avif$/i, ".webp");
	const oldEntry = entries.get(relOld);
	if (oldEntry) {
		entries.delete(relOld);
		entries.set(relNew, { path: relNew, size: buf.length });
	}
}

// ── 外链图片镜像：扫描 seed 文本文件中的外链图片 URL，下载到 remote/<host>/<path>，
//    配合 seedRepo.localizeUrl() 在快照模式下把外链改写为本地路径，实现完全离线预览。
//    该步骤不受 MAX_TOTAL 限制（APK 包体优先保证离线完整性）。
const REMOTE_URL_RE = /https?:\/\/[^\s"'<>)\]]+\.(?:webp|jpe?g|png|gif|avif)/gi;
const remoteUrls = new Set();
for (const full of walkLocal(OUT)) {
	if (!/\.(md|txt|tsx?|json)$/i.test(full)) continue;
	for (const m of fs.readFileSync(full, "utf8").matchAll(REMOTE_URL_RE)) {
		if (!/example\.com/i.test(m[0])) remoteUrls.add(m[0]);
	}
}
let mirrored = 0;
const failedRemote = [];
for (const url of remoteUrls) {
	try {
		const u = new URL(url);
		const rel = `remote/${u.host}${u.pathname}`;
		const dest = path.join(OUT, ...rel.split("/"));
		if (!fs.existsSync(dest)) {
			const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
		}
		entries.set(rel, { path: rel, size: fs.statSync(dest).size });
		mirrored++;
	} catch (e) {
		failedRemote.push(`${url} (${e.message})`);
	}
}
if (remoteUrls.size) console.log(`外链镜像：${mirrored}/${remoteUrls.size} 个（${[...remoteUrls].length} 个唯一 URL）`);
if (failedRemote.length) console.log("镜像失败（未离线，运行时仍走原 URL）:", failedRemote.join(", "));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(
	path.join(OUT, "manifest.json"),
	JSON.stringify({ source: `${REPO}@${BRANCH} + 本地壁纸/相册图片 + 外链镜像`, generated: new Date().toISOString(), files: [...entries.values()] }, null, "\t")
);
console.log(`打包完成：${entries.size} 个文件，总大小 ${(total / 1024 / 1024).toFixed(2)} MB → ${OUT}/`);
if (failed.length) console.log("CDN 获取失败（未入库）:", failed.join(", "));
