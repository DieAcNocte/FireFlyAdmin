import { spawn, type ChildProcess } from "node:child_process";
import type { ProjectProfile } from "../settings.js";

const MAX_LOG_LINES = 400;

let child: ChildProcess | null = null;
let devCwd: string | null = null;
let logs: string[] = [];

function pushLog(line: string) {
	logs.push(line);
	if (logs.length > MAX_LOG_LINES) logs = logs.slice(-MAX_LOG_LINES);
}

function isRunning(): boolean {
	return !!child && child.exitCode === null && !child.killed;
}

export function devStatus() {
	return {
		running: isRunning(),
		cwd: devCwd,
		logs: logs.slice(-MAX_LOG_LINES),
		url: "http://localhost:4321/",
	};
}

export function startDev(project: ProjectProfile) {
	if (isRunning()) {
		if (devCwd === project.localPath) return devStatus();
		stopDev();
	}
	logs = [];
	devCwd = project.localPath;
	pushLog(`[admin] 正在 ${project.localPath} 启动 pnpm dev ...`);
	child = spawn("pnpm", ["dev"], {
		cwd: project.localPath,
		shell: process.platform === "win32",
		env: { ...process.env },
	});
	child.stdout?.on("data", (d: Buffer) => {
		for (const line of d.toString().split(/\r?\n/)) if (line.trim()) pushLog(line);
	});
	child.stderr?.on("data", (d: Buffer) => {
		for (const line of d.toString().split(/\r?\n/)) if (line.trim()) pushLog(line);
	});
	child.on("exit", (code) => {
		pushLog(`[admin] 博客 dev server 已退出（code=${code ?? "unknown"}）`);
		child = null;
	});
	return devStatus();
}

export function stopDev() {
	if (!child) return devStatus();
	const c = child;
	child = null;
	try {
		if (process.platform === "win32" && c.pid) {
			// shell:true 包装下需要杀整棵进程树
			spawn("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
		} else {
			c.kill("SIGTERM");
		}
		pushLog("[admin] 已发送停止指令");
	} catch (e) {
		pushLog(`[admin] 停止失败: ${e instanceof Error ? e.message : String(e)}`);
	}
	return devStatus();
}
