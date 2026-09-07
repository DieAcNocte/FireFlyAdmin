<template>
	<div class="connect-page">
		<div class="connect-card">
			<div class="brand">
				<img v-if="!iconFailed" :src="apiUrl('/api/app/icon')" class="brand-icon" alt="" @error="iconFailed = true" />
				<span v-else class="brand-icon">🔥</span>
				<span>FireFly管理后台</span>
			</div>

			<p class="connect-tip">{{ tipText }}</p>

			<el-form label-position="top" @submit.prevent>
				<el-form-item label="博客仓库">
					<el-input v-model="repoInput" placeholder="owner/repo 或 https://github.com/owner/repo" clearable autocomplete="off" />
					<div class="field-hint">即博客源码所在的 GitHub 仓库（FireFly / Mizuki 等主题源码仓库）</div>
				</el-form-item>
				<el-form-item label="分支">
					<el-input v-model="branch" placeholder="main" autocomplete="off" />
				</el-form-item>
				<el-form-item label="GitHub 访问令牌（PAT）">
					<el-input v-model="ghToken" placeholder="ghp_…（需要 repo 写权限）" clearable show-password autocomplete="off" />
					<div class="field-hint">
						GitHub → Settings → Developer settings → Personal access tokens 生成，勾选 repo 权限。令牌仅保存在本机。
					</div>
				</el-form-item>
				<el-form-item label="提交信息（可选）">
					<el-input v-model="ghMessage" placeholder="留空则按操作类型自动填写（如 feat: 更新文章）" />
				</el-form-item>
				<div class="actions">
					<el-button :loading="testing" @click="testGithub">测试仓库</el-button>
					<el-button type="primary" :loading="saving" @click="save">保存并进入</el-button>
				</div>
			</el-form>

			<el-alert v-if="testMessage" :type="testOk ? 'success' : 'error'" :title="testMessage" :closable="false" class="test-result" />

			<div v-if="isNative" class="skip-row">
				<el-button text type="info" size="small" @click="skip">跳过，先预览界面 →</el-button>
			</div>

			<div class="mode-note">
				{{ isNative ? "直连模式下，每次保存都会直接提交到 GitHub 仓库；如需通过局域网连接电脑端（功能更全），请到「应用设置 → 实验功能」。" : "填写 GitHub 仓库信息后，浏览器即可使用直连模式（多用于电脑上预览手机版功能）。" }}
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { isNative, markSkipped, parseRepoInput, saveGithubConfig, ghConfig, apiUrl, UPSTREAM_TEMPLATE } from "../api/base";

const props = defineProps<{ reason: "unconfigured" | "unreachable" | "unauthorized" }>();

const repoInput = ref(
	ghConfig.value.owner
		? `${ghConfig.value.owner}/${ghConfig.value.repo}`
		: `${UPSTREAM_TEMPLATE.owner}/${UPSTREAM_TEMPLATE.repo}`
);
const branch = ref(ghConfig.value.owner ? ghConfig.value.branch || UPSTREAM_TEMPLATE.branch : UPSTREAM_TEMPLATE.branch);
const ghToken = ref(ghConfig.value.token);
const ghMessage = ref(ghConfig.value.commitMessage);
const testing = ref(false);
const saving = ref(false);
const testOk = ref(false);
const testMessage = ref("");
const iconFailed = ref(false);

const TIPS: Record<typeof props.reason, string> = {
	unconfigured: "已预填上游 FireFly 模板仓库（内置离线快照，可直接预览）。正式使用请换成你自己的博客仓库并填写 PAT。",
	unreachable: "无法连接 GitHub，请检查网络或仓库信息是否正确。",
	unauthorized: "该仓库需要令牌访问，请填写有 repo 权限的 PAT。",
};
const tipText = computed(() => TIPS[props.reason] ?? "");

/** 测试 GitHub 仓库可达性与令牌权限 */
async function testGithub() {
	testing.value = true;
	testMessage.value = "";
	try {
		const parsed = parseRepoInput(repoInput.value);
		if (!parsed) throw new Error("仓库格式不正确，请填写 owner/repo 或完整 URL");
		const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
		if (ghToken.value.trim()) headers["Authorization"] = `Bearer ${ghToken.value.trim()}`;
		const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, { headers });
		const data = await res.json().catch(() => ({}));
		if (res.status === 401) throw new Error("令牌无效或已过期");
		if (res.status === 404) throw new Error("仓库不存在（或令牌无权访问私有仓库）");
		if (!res.ok) throw new Error(data?.message || `请求失败 (${res.status})`);
		testOk.value = true;
		testMessage.value = `仓库可达：${data.full_name}（默认分支 ${data.default_branch}）`;
	} catch (e) {
		testOk.value = false;
		testMessage.value = e instanceof Error ? e.message : String(e);
	} finally {
		testing.value = false;
	}
}

/** 跳过配置：进入主界面预览（跳过状态持久化，可随时从菜单「连接设置」回来配置） */
async function skip() {
	await markSkipped();
	location.reload();
}

async function save() {
	saving.value = true;
	try {
		const parsed = parseRepoInput(repoInput.value);
		if (!parsed) {
			ElMessage.warning("仓库格式不正确，请填写 owner/repo 或完整 URL");
			return;
		}
		if (!ghToken.value.trim()) {
			try {
				await ElMessageBox.confirm(
					"未填写访问令牌：公开仓库将以只读模式打开（可浏览内容，无法保存修改）。\n正式使用请填写有 repo 写权限的 PAT。仍要以只读方式继续吗？",
					"未填写令牌",
					{ type: "info", confirmButtonText: "只读预览", cancelButtonText: "返回填写" }
				);
			} catch {
				return;
			}
		}
		await saveGithubConfig({ owner: parsed.owner, repo: parsed.repo, branch: branch.value || "main", token: ghToken.value, commitMessage: ghMessage.value });
		// 重新走启动流程（连接配置在启动时读取），兼容连接屏与 /connect 路由两种挂载方式
		location.reload();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		saving.value = false;
	}
}
</script>

<style scoped>
.connect-page {
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	background: var(--el-bg-color-page);
	overflow: auto;
}

.connect-card {
	width: 100%;
	max-width: 420px;
	background: var(--el-bg-color);
	border: 1px solid var(--el-border-color-light);
	border-radius: 10px;
	padding: 28px 24px;
	box-shadow: var(--el-box-shadow-light);
}

.brand {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 700;
	font-size: 16px;
	color: var(--el-text-color-primary);
	justify-content: center;
	margin-bottom: 14px;
}

.brand-icon {
	width: 22px;
	height: 22px;
	object-fit: contain;
	font-size: 18px;
	line-height: 1;
}

.connect-tip {
	color: var(--el-text-color-secondary);
	font-size: 13px;
	line-height: 1.7;
	margin: 0 0 16px;
	text-align: center;
}

.field-hint {
	color: var(--el-text-color-secondary);
	font-size: 12px;
	line-height: 1.5;
	margin-top: 4px;
}

.actions {
	display: flex;
	justify-content: flex-end;
	gap: 10px;
	margin-top: 4px;
}

.test-result {
	margin-top: 12px;
}

.skip-row {
	text-align: center;
	margin-top: 10px;
}

.mode-note {
	margin-top: 16px;
	padding-top: 12px;
	border-top: 1px dashed var(--el-border-color-lighter);
	color: var(--el-text-color-secondary);
	font-size: 12px;
	line-height: 1.6;
}
</style>
