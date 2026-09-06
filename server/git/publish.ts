import fs from "node:fs";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import { ROOT_DIR, type ProjectProfile } from "../settings.js";

function gitFor(project: ProjectProfile): SimpleGit {
	const config: string[] = [];
	if (project.authorName) config.push(`user.name=${project.authorName}`);
	if (project.authorEmail) config.push(`user.email=${project.authorEmail}`);
	return simpleGit({ baseDir: project.localPath, config });
}

/** SSH 形式的 GitHub 地址转 HTTPS（便于使用 Token 认证） */
function toHttpsUrl(remoteUrl: string): string {
	const m = remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
	if (m) return `https://${m[1]}/${m[2]}.git`;
	return remoteUrl;
}

function ensureAskpassScript(): string {
	const dir = path.join(ROOT_DIR, "data");
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, "askpass.sh");
	const content = [
		"#!/bin/sh",
		'case "$1" in',
		'  *Username*) echo "x-access-token" ;;',
		'  *) echo "$FIREFLY_ADMIN_TOKEN" ;;',
		"esac",
		"",
	].join("\n");
	fs.writeFileSync(file, content, { encoding: "utf-8", flag: "w" });
	return file;
}

export async function gitStatus(project: ProjectProfile) {
	const git = gitFor(project);
	const st = await git.status();
	return {
		branch: st.current ?? "",
		ahead: st.ahead ?? 0,
		behind: st.behind ?? 0,
		detached: st.detached,
		files: st.files.map((f) => ({
			path: f.path,
			staged: f.index !== " " && f.index !== "?",
			modified: f.working_dir !== " ",
			untracked: f.index === "?" && f.working_dir === "?",
			deleted: f.working_dir === "D" || f.index === "D",
		})),
	};
}

export async function gitCommit(project: ProjectProfile, message: string) {
	const msg = message.trim();
	if (!msg) throw new Error("提交信息不能为空");
	const git = gitFor(project);
	await git.add("-A");
	const result = await git.commit(msg);
	const hash = (Array.isArray(result) ? result[0] : result)?.commit ?? "";
	return { hash, message: msg, summary: (Array.isArray(result) ? result[0] : result)?.summary };
}

export async function gitPush(project: ProjectProfile) {
	if (!project.remoteUrl) {
		throw new Error("尚未配置远程仓库地址，请在「项目管理」中填写");
	}
	const branch = project.branch || "master";
	const git = gitFor(project);
	if (project.token) {
		// Token 认证：经 GIT_ASKPASS 注入，token 不出现在命令行参数中
		const askpass = ensureAskpassScript();
		await git
			.env({
				GIT_ASKPASS: askpass,
				FIREFLY_ADMIN_TOKEN: project.token,
				GIT_TERMINAL_PROMPT: "0",
			})
			.push(toHttpsUrl(project.remoteUrl), branch);
	} else {
		await git.env({ GIT_TERMINAL_PROMPT: "0" }).push(project.remoteUrl, branch);
	}
	return { ok: true, url: project.remoteUrl.replace(/^https?:\/\//, "").replace(/\.git$/, ""), branch };
}

export async function gitLog(project: ProjectProfile, maxCount = 15) {
	const git = gitFor(project);
	try {
		const log = await git.log({ maxCount });
		return log.all.map((c) => ({
			hash: c.hash.slice(0, 7),
			author: c.author_name,
			date: c.date,
			message: c.message,
		}));
	} catch {
		return [];
	}
}
