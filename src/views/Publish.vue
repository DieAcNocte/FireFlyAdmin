<template>
	<div v-loading="loading">
		<el-card shadow="never" class="page-card">
			<template #header>
				<div class="card-header">
					<span>发布到 GitHub</span>
					<el-button size="small" @click="load">刷新</el-button>
				</div>
			</template>
			<el-descriptions :column="3" border>
				<el-descriptions-item label="项目">{{ projectName }}</el-descriptions-item>
				<el-descriptions-item label="分支">{{ status?.branch || "-" }}</el-descriptions-item>
				<el-descriptions-item label="远程仓库">
					<template v-if="status?.remoteConfigured">{{ remoteUrl }}</template>
					<el-tag v-else type="warning" size="small">未配置</el-tag>
				</el-descriptions-item>
			</el-descriptions>
			<el-alert
				v-if="status && !status.remoteConfigured"
				type="warning"
				:closable="false"
				title="尚未配置远程仓库地址与密钥"
				style="margin-top: 12px"
			>
				请前往
				<el-link type="primary" @click="$router.push('/settings')">项目管理</el-link>
				填写仓库地址（HTTPS 或 SSH）与 GitHub Token（可选）。
			</el-alert>
		</el-card>

		<el-card shadow="never" class="page-card">
			<template #header>
				<div class="card-header">
					<span>变更文件（{{ status?.files.length ?? 0 }}）</span>
					<el-tag v-if="status && status.ahead > 0" type="info" size="small">本地领先 {{ status.ahead }} 个提交</el-tag>
				</div>
			</template>
			<el-table :data="status?.files ?? []" size="small" max-height="300">
				<el-table-column prop="path" label="文件" min-width="320" show-overflow-tooltip />
				<el-table-column label="状态" width="120">
					<template #default="{ row }">
						<el-tag v-if="row.untracked" type="info" size="small">新文件</el-tag>
						<el-tag v-else-if="row.deleted" type="danger" size="small">已删除</el-tag>
						<el-tag v-else-if="row.staged" type="success" size="small">已暂存</el-tag>
						<el-tag v-else type="warning" size="small">已修改</el-tag>
					</template>
				</el-table-column>
			</el-table>
			<el-empty v-if="status && status.files.length === 0" description="工作区干净，没有需要提交的变更" :image-size="60" />

			<el-divider>提交信息</el-divider>
			<el-input v-model="message" type="textarea" :rows="2" placeholder="如：feat: 新增xx文章" />
			<div class="commit-actions">
				<el-button type="primary" :loading="committing" :disabled="!status?.files.length" @click="commit">提交到本地</el-button>
				<el-button type="success" :loading="pushing" :disabled="!status?.remoteConfigured" @click="commitAndPush">
					提交并推送到 GitHub
				</el-button>
				<el-button :loading="pushing" :disabled="!status?.remoteConfigured || (status?.ahead ?? 0) === 0" @click="pushOnly">
					仅推送
				</el-button>
			</div>
		</el-card>

		<el-card shadow="never">
			<template #header>最近提交</template>
			<el-table :data="commits" size="small">
				<el-table-column prop="hash" label="Hash" width="90" />
				<el-table-column prop="message" label="提交信息" min-width="280" show-overflow-tooltip />
				<el-table-column prop="author" label="作者" width="140" />
				<el-table-column prop="date" label="时间" width="180">
					<template #default="{ row }">{{ new Date(row.date).toLocaleString("zh-CN") }}</template>
				</el-table-column>
			</el-table>
		</el-card>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { api, type GitCommit } from "../api";
import { activeProject } from "../stores/project";

const loading = ref(false);
const committing = ref(false);
const pushing = ref(false);
const status = ref<Awaited<ReturnType<typeof api.git.status>> | null>(null);
const commits = ref<GitCommit[]>([]);
const message = ref("");

const projectName = ref("");

onMounted(load);

async function load() {
	loading.value = true;
	try {
		status.value = await api.git.status();
		commits.value = (await api.git.log()).commits;
		projectName.value = activeProject.value?.name ?? "";
		if (activeProject.value?.messageTemplate && !message.value) {
			message.value = activeProject.value.messageTemplate;
		}
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

async function commit() {
	await doCommit();
}

async function commitAndPush() {
	await doCommit(true);
}

async function doCommit(andPush = false) {
	await ElMessageBox.confirm(
		andPush
			? "将把全部变更提交并推送到配置的远程仓库，确认？"
			: "将把全部变更提交到本地 git，确认？",
		"提交确认",
		{ type: "info" }
	);
	committing.value = true;
	try {
		const r = await api.git.commit(message.value);
		ElMessage.success(`已提交 ${r.hash}`);
		if (andPush) await doPush();
		else await load();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		committing.value = false;
	}
}

async function pushOnly() {
	await doPush();
}

async function doPush() {
	pushing.value = true;
	try {
		const r = await api.git.push();
		ElMessage.success(`已推送到 ${r.url}（${r.branch}）`);
		await load();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		pushing.value = false;
	}
}
</script>

<style scoped>
.card-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.commit-actions {
	margin-top: 12px;
	display: flex;
	gap: 10px;
}
</style>
