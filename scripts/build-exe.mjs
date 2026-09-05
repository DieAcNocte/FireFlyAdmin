/**
 * 打包 Windows 单文件 EXE（Node SEA 方案）。
 *
 * 产物：FireflyAdmin.exe（项目根目录）
 * - 前端 dist/ 全部内嵌进 EXE，双击即启动并自动打开浏览器
 * - sharp（原生模块）无法嵌入：运行时从 EXE 同目录的 node_modules 加载，
 *   因此把 EXE 放在管理后台项目目录下使用可获得完整的 AVIF 转换能力
 * - 数据目录为 EXE 同目录的 data/
 *
 * 运行：pnpm build:exe
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import esbuild from "esbuild";

const root = process.cwd();
const outDir = path.join(root, "release");
const bundleFile = path.join(outDir, "server.cjs");
const blobFile = path.join(outDir, "sea-prep.blob");
const seaConfigFile = path.join(outDir, "sea-config.json");
const exeFile = path.join(root, "FireflyAdmin.exe");

function run(cmd, args, opts = {}) {
	console.log(`> ${cmd} ${args.join(" ")}`);
	// Windows 下 pnpm 是 .cmd，必须经 shell 调起
	const shell = process.platform === "win32" && cmd === "pnpm";
	execFileSync(cmd, args, { stdio: "inherit", cwd: root, shell, ...opts });
}

// 1. 前端构建
console.log("[1/6] 构建前端 (vite build)...");
run("pnpm", ["exec", "vite", "build"]);

// 2. 后端打包为单文件 CJS（sharp 除外：原生模块，运行时懒加载）
console.log("[2/6] 打包后端 (esbuild)...");
fs.mkdirSync(outDir, { recursive: true });
esbuild.buildSync({
	entryPoints: [path.join(root, "server", "index.ts")],
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node22",
	outfile: bundleFile,
	external: ["sharp"],
	define: { __SEA_BUILD: '"true"' },
	sourcemap: false,
	minify: false,
	legalComments: "none",
	logLevel: "info",
});

// 3. 生成 SEA 配置（内嵌 dist 资源）
console.log("[3/6] 生成 sea-config（内嵌前端资源）...");
const assets = {};
function walk(dir, base = "") {
	for (const name of fs.readdirSync(dir)) {
		const full = path.join(dir, name);
		const rel = base ? `${base}/${name}` : name;
		if (fs.statSync(full).isDirectory()) walk(full, rel);
		else assets[`dist/${rel.replace(/\\/g, "/")}`] = path.relative(root, full).replace(/\\/g, "/");
	}
}
walk(path.join(root, "dist"));
fs.writeFileSync(
	seaConfigFile,
	JSON.stringify(
		{
			main: path.relative(root, bundleFile).replace(/\\/g, "/"),
			output: path.relative(root, blobFile).replace(/\\/g, "/"),
			disableExperimentalSEAWarning: true,
			assets,
		},
		null,
		"\t"
	)
);
run("node", ["--experimental-sea-config", path.relative(root, seaConfigFile).replace(/\\/g, "/")]);

// 4. 复制 node.exe 为 FireflyAdmin.exe（先结束可能还在运行的旧实例）
console.log("[4/6] 复制 Node 运行时...");
try {
	spawnSync("taskkill", ["/F", "/IM", "FireflyAdmin.exe"], { stdio: "ignore" });
} catch {
	/* ignore */
}
fs.copyFileSync(process.execPath, exeFile);

// 5. 注入 SEA blob
console.log("[5/6] 注入 SEA blob (postject)...");
run("pnpm", [
	"exec",
	"postject",
	path.relative(root, exeFile),
	"NODE_SEA_BLOB",
	path.relative(root, blobFile),
	"--sentinel-fuse",
	"NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
]);

// 6. 完成
const sizeMB = (fs.statSync(exeFile).size / 1024 / 1024).toFixed(1);
console.log(`[6/6] 打包完成: ${exeFile} (${sizeMB} MB)`);
console.log("双击 FireflyAdmin.exe 即可启动（自动打开 http://127.0.0.1:5175）。");
console.log("提示：放在本目录下运行可获得完整功能（sharp AVIF 转换 + 已有项目配置）。");
