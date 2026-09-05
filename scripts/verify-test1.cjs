/** Test1 验收：演示内容 + DEV 启动验证 */
const BASE = "http://127.0.0.1:5175/api";
const fs = require("fs");

async function j(method, url, body) {
	const r = await fetch(BASE + url, {
		method,
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});
	return r.json();
}

(async () => {
	const st = await j("GET", "/setup/status");
	console.log("激活项目:", st.project.name);

	const demo = await j("POST", "/setup/demo");
	console.log("演示内容:", JSON.stringify(demo));

	const posts = fs.readdirSync("D:/Documents/ZcodeProject/Test1/src/content/posts");
	const dynamics = fs.readdirSync("D:/Documents/ZcodeProject/Test1/src/content/dynamic");
	console.log("文章目录:", posts.join(","), "| 动态目录:", dynamics.join(","));

	const gal = await j("GET", "/gallery");
	console.log("相册:", gal.albums.map((a) => a.id + (a.password ? "(加密)" : "")).join(","));

	const dev = await j("POST", "/blog/dev", { action: "start" });
	console.log("DEV 启动:", dev.running);
})();
