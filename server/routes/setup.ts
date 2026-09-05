/**
 * 初始设置向导 API：
 * - 状态/完成标记
 * - 生成默认演示内容
 * - SSH 密钥生成（引导手动添加到 GitHub）
 * - 远程连接测试（HTTPS+Token / SSH）
 * - 同步：克隆或拉取远程内容到本地项目
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { Hono } from "hono";
import {
	getActiveProject,
	isSetupCompleted,
	setSetupCompleted,
	validateProjectPath,
	type ProjectProfile,
} from "../settings.js";
import { generateAllDemoContent } from "../setup/demo.js";

const SSH_KEY_NAME = "firefly_admin_ed25519";

function sshDir(): string {
	return path.join(os.homedir(), ".ssh");
}

function sshKeyPath(): string {
	return path.join(sshDir(), SSH_KEY_NAME);
}

/** 复用 git/publish 的 Token 注入方式：返回带 GIT_ASKPASS 的 env */
function gitEnvWithToken(token: string): Record<string, string> {
	const env: Record<string, string> = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
	if (token) {
		const askpass = path.join(process.cwd(), "data", "askpass.sh");
		fs.mkdirSync(path.dirname(askpass), { recursive: true });
		fs.writeFileSync(
			askpass,
			['#!/bin/sh', 'case "$1" in', '  *Username*) echo "x-access-token" ;;', '  *) echo "$FIREFLY_ADMIN_TOKEN" ;;', "esac", ""].join("\n"),
			"utf-8"
		);
		env.GIT_ASKPASS = askpass;
		env.FIREFLY_ADMIN_TOKEN = token;
	}
	return env;
}

/** SSH 形式地址转 HTTPS（Token 只适用于 HTTPS） */
function toHttpsUrl(remoteUrl: string): string {
	const m = remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
	if (m) return `https://${m[1]}/${m[2]}.git`;
	return remoteUrl;
}

export const setupRoutes = new Hono()
	.get("/status", (c) => {
		const project = getActiveProject();
		const v = validateProjectPath(project.localPath);
		let isGitRepo = false;
		try {
			isGitRepo = fs.existsSync(path.join(project.localPath, ".git"));
		} catch {
			/* ignore */
		}
		return c.json({
			setupCompleted: isSetupCompleted(),
			project: { id: project.id, name: project.name, localPath: project.localPath, remoteUrl: project.remoteUrl, token: !!project.token, branch: project.branch },
			validation: v,
			isGitRepo,
		});
	})
	.post("/complete", (c) => {
		setSetupCompleted(true);
		return c.json({ ok: true });
	})
	.post("/rerun", (c) => {
		setSetupCompleted(false);
		return c.json({ ok: true });
	})
	// 生成默认演示内容（仅作用于当前激活项目，调用方须自行确认）
	.post("/demo", (c) => {
		const r = generateAllDemoContent();
		return c.json({ ok: true, ...r });
	})
	// 生成 SSH 密钥对（ed25519，已存在则复用），返回公钥供用户手动添加到 GitHub
	.post("/ssh-keygen", (c) => {
		fs.mkdirSync(sshDir(), { recursive: true });
		const keyPath = sshKeyPath();
		const pubPath = keyPath + ".pub";
		if (!fs.existsSync(pubPath)) {
			execFileSync("ssh-keygen", ["-t", "ed25519", "-C", "firefly-admin", "-f", keyPath, "-N", ""], { stdio: "pipe" });
		}
		const publicKey = fs.readFileSync(pubPath, "utf-8").trim();
		return c.json({ ok: true, publicKey, keyPath });
	})
	// 远程连接测试：HTTPS+Token 或 SSH 地址
	.post("/test-remote", async (c) => {
		const body = (await c.req.json()) as { url: string; token?: string; branch?: string };
		const url = (body.url || "").trim();
		if (!url) return c.json({ error: "请填写仓库地址" }, 400);
		const env = gitEnvWithToken(body.token || "");
		try {
			execFileSync("git", ["ls-remote", toHttpsUrl(url), "HEAD"], { env, stdio: "pipe", timeout: 30000 });
			return c.json({ ok: true, message: "连接成功，仓库可访问" });
		} catch (e: any) {
			const stderr = String(e.stderr || e.message || "");
			let hint = stderr.split("\n").filter(Boolean).slice(-3).join(" ");
			if (/Authentication failed|403|401/i.test(stderr)) hint = "认证失败：请检查 Token 权限（需 repo）或密钥是否已添加到 GitHub";
			else if (/Could not resolve host/i.test(stderr)) hint = "无法解析主机：请检查网络或仓库地址拼写";
			else if (/not found|repository .* not found/i.test(stderr)) hint = "仓库不存在：请确认地址与仓库可见性";
			return c.json({ error: "连接失败：" + (hint || "未知错误") }, 400);
		}
	})
	// 同步：本地无 .git 且目录为空 → clone；已有仓库 → 拉取（ff-only）；否则报错
	.post("/sync", async (c) => {
		const project: ProjectProfile = getActiveProject();
		const v = validateProjectPath(project.localPath);
		if (!v.ok) return c.json({ error: "本地路径无效：" + v.problems.join("；") }, 400);
		if (!project.remoteUrl) return c.json({ error: "尚未配置远程仓库地址" }, 400);
		const branch = project.branch || "master";
		const env = gitEnvWithToken(project.token || "");
		const url = project.token ? toHttpsUrl(project.remoteUrl) : project.remoteUrl;
		const gitDir = path.join(project.localPath, ".git");
		try {
			if (!fs.existsSync(gitDir)) {
				const entries = fs.readdirSync(project.localPath);
				if (entries.length > 0) {
					return c.json({ error: "目录非空且不是 git 仓库，无法克隆。请选择空目录或已有仓库目录。" }, 400);
				}
				execFileSync("git", ["clone", "-b", branch, url, project.localPath], { env, stdio: "pipe", timeout: 300000 });
				return c.json({ ok: true, action: "clone", message: `已克隆 ${branch} 分支到本地` });
			}
			const status = await gitStatusSafe(project.localPath, env);
			if (!status) return c.json({ error: "本地 git 状态读取失败" }, 500);
			if (status.trim().length > 0) {
				return c.json({ error: "本地有未提交的修改，请先提交或暂存（stash）后再同步，以免覆盖本地工作。" }, 400);
			}
			execFileSync("git", ["fetch", url, branch], { env, cwd: project.localPath, stdio: "pipe", timeout: 300000 });
			execFileSync("git", ["merge", "--ff-only", "FETCH_HEAD"], { env, cwd: project.localPath, stdio: "pipe", timeout: 120000 });
			return c.json({ ok: true, action: "pull", message: "已拉取远程最新内容" });
		} catch (e: any) {
			const stderr = String(e.stderr || e.message || "");
			if (/not something we can merge|divergent/i.test(stderr)) {
				return c.json({ error: "本地与远程历史不一致，无法快进合并。请确认远程分支内容后再试。" }, 400);
			}
			return c.json({ error: "同步失败：" + stderr.split("\n").filter(Boolean).slice(-3).join(" ") }, 400);
		}
	})
	// 高风险：强制与远程同步（fetch + reset --hard + clean），本地未提交内容全部丢弃
	.post("/force-sync", async (c) => {
		const project: ProjectProfile = getActiveProject();
		const v = validateProjectPath(project.localPath);
		if (!v.ok) return c.json({ error: "本地路径无效：" + v.problems.join("；") }, 400);
		if (!project.remoteUrl) return c.json({ error: "尚未配置远程仓库地址" }, 400);
		const branch = project.branch || "master";
		const env = gitEnvWithToken(project.token || "");
		const url = project.token ? toHttpsUrl(project.remoteUrl) : project.remoteUrl;
		const gitDir = path.join(project.localPath, ".git");
		if (!fs.existsSync(gitDir)) {
			return c.json({ error: "本地目录不是 git 仓库，无法同步。请先在向导第 4 步克隆或手动初始化。" }, 400);
		}
		const steps: string[] = [];
		try {
			execFileSync("git", ["fetch", url, branch], { env, cwd: project.localPath, stdio: "pipe", timeout: 300000 });
			steps.push("已拉取远程 " + branch);
			execFileSync("git", ["reset", "--hard", "FETCH_HEAD"], { env, cwd: project.localPath, stdio: "pipe", timeout: 120000 });
			steps.push("已将本地重置为远程状态");
			execFileSync("git", ["clean", "-fd"], { env, cwd: project.localPath, stdio: "pipe", timeout: 120000 });
			steps.push("已清理未跟踪的新文件");
			return c.json({ ok: true, message: steps.join("；") + "。本地已与远程 " + branch + " 完全一致。" });
		} catch (e: any) {
			const stderr = String(e.stderr || e.message || "");
			return c.json({ error: "同步失败：" + stderr.split("\n").filter(Boolean).slice(-3).join(" ") }, 400);
		}
	});

function gitStatusSafe(cwd: string, env: Record<string, string>): Promise<string | null> {
	return new Promise((resolve) => {
		try {
			const out = execFileSync("git", ["status", "--porcelain"], { env, cwd, stdio: "pipe", timeout: 30000 });
			resolve(out.toString());
		} catch {
			resolve(null);
		}
	});
}
