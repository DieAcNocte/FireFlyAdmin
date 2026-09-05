<template>
	<div>
		<div class="toolbar">
			<el-alert
				type="info"
				:closable="false"
				style="flex: 1"
				title="项目 = 一个本地博客目录 + 一套发布配置。所有数据保存在本机 data/settings.json（已 gitignore），Token 绝不会上传。"
			/>
			<el-button type="primary" @click="openCreate">
				<el-icon><Plus /></el-icon>&nbsp;新增项目
			</el-button>
		</div>

		<el-table :data="projects" v-loading="loading">
			<el-table-column label="名称" width="160">
				<template #default="{ row }">
					{{ row.name }}
					<el-tag v-if="row.id === activeId" type="success" size="small" style="margin-left: 6px">当前</el-tag>
				</template>
			</el-table-column>
			<el-table-column prop="localPath" label="本地路径" min-width="240" show-overflow-tooltip />
			<el-table-column label="远程仓库" min-width="220" show-overflow-tooltip>
				<template #default="{ row }">
					<span v-if="row.remoteUrl">{{ row.remoteUrl }}</span>
					<el-tag v-else type="warning" size="small">未配置</el-tag>
				</template>
			</el-table-column>
			<el-table-column label="密钥" width="90">
				<template #default="{ row }">
					<el-tag v-if="row.hasToken" type="success" size="small">已配置</el-tag>
					<el-tag v-else type="info" size="small">SSH/未配</el-tag>
				</template>
			</el-table-column>
			<el-table-column prop="branch" label="分支" width="90" />
			<el-table-column label="操作" width="220" fixed="right">
				<template #default="{ row }">
					<el-button v-if="row.id !== activeId" size="small" type="success" plain @click="activate(row)">切换到此项目</el-button>
					<el-button size="small" @click="openEdit(row)">编辑</el-button>
					<el-button size="small" type="danger" plain :disabled="projects.length <= 1" @click="remove(row)">删除</el-button>
				</template>
			</el-table-column>
		</el-table>

		<el-card shadow="never" style="margin-top: 16px">
			<template #header>Token 配置说明</template>
			<ol style="margin: 0; padding-left: 20px; line-height: 2; color: #606266">
				<li>在 GitHub 打开 Settings → Developer settings → Personal access tokens，生成一个<b>经典 Token</b>（勾选 <code>repo</code> 权限）。</li>
				<li>把 Token 粘贴到项目的「密钥」字段，远程仓库地址使用 HTTPS 形式（如 <code>https://github.com/用户名/仓库.git</code>）。</li>
				<li>如果留空密钥，将直接按仓库地址推送（SSH 地址需本机已配置好 SSH Key）。</li>
				<li>推送使用 Token 临时凭证，不会修改博客仓库的 remote 配置。</li>
			</ol>
		</el-card>

		<el-dialog v-model="dialogVisible" :title="editId ? '编辑项目' : '新增项目'" width="640px">
			<el-form label-width="110px">
				<el-form-item label="项目名称" required>
					<el-input v-model="form.name" placeholder="如：Yoimiya" />
				</el-form-item>
				<el-form-item label="本地路径" required>
					<el-input v-model="form.localPath" placeholder="D:\Documents\ZcodeProject\Yoimiya">
						<template #append>
							<el-button @click="validate">校验</el-button>
						</template>
					</el-input>
					<div class="form-tip" :class="validateResult?.ok ? 'ok' : 'bad'">
						<template v-if="validateResult">
							{{ validateResult.ok ? "✓ 路径有效" : `✗ ${validateResult.problems.join("；")}` }}
						</template>
						<template v-else>需要是一个 Firefly 类博客项目（含 src/config、src/content）</template>
					</div>
				</el-form-item>
				<el-form-item label="远程仓库地址">
					<el-input v-model="form.remoteUrl" placeholder="https://github.com/用户名/仓库.git 或 git@github.com:用户名/仓库.git" />
				</el-form-item>
				<el-form-item label="Token 密钥">
					<el-input v-model="form.token" type="password" show-password :placeholder="editTokenHint" />
				</el-form-item>
				<el-row :gutter="12">
					<el-col :span="12">
						<el-form-item label="分支">
							<el-input v-model="form.branch" placeholder="master" />
						</el-form-item>
					</el-col>
				</el-row>
				<el-row :gutter="12">
					<el-col :span="12">
						<el-form-item label="提交作者名">
							<el-input v-model="form.authorName" placeholder="留空使用 git 全局配置" />
						</el-form-item>
					</el-col>
					<el-col :span="12">
						<el-form-item label="作者邮箱">
							<el-input v-model="form.authorEmail" />
						</el-form-item>
					</el-col>
				</el-row>
				<el-form-item label="提交信息模板">
					<el-input v-model="form.messageTemplate" placeholder="feat: 更新博客内容" />
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="dialogVisible = false">取消</el-button>
				<el-button type="primary" :loading="saving" @click="save">保存</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { api, type ProjectProfile } from "../api";
import { loadProjects, projectStore } from "../stores/project";

const projects = ref<ProjectProfile[]>([]);
const activeId = ref("");
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const editId = ref("");
const editTokenHint = ref("GitHub Personal Access Token（repo 权限）");
const validateResult = ref<{ ok: boolean; problems: string[] } | null>(null);

const form = ref({
	name: "",
	localPath: "",
	remoteUrl: "",
	token: "",
	branch: "master",
	authorName: "",
	authorEmail: "",
	messageTemplate: "feat: 更新博客内容",
});

onMounted(load);

async function load() {
	loading.value = true;
	try {
		const res = await api.projects.list();
		projects.value = res.projects;
		activeId.value = res.activeProjectId;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

function openCreate() {
	editId.value = "";
	editTokenHint.value = "GitHub Personal Access Token（repo 权限）";
	validateResult.value = null;
	form.value = { name: "", localPath: "", remoteUrl: "", token: "", branch: "master", authorName: "", authorEmail: "", messageTemplate: "feat: 更新博客内容" };
	dialogVisible.value = true;
}

function openEdit(row: ProjectProfile) {
	editId.value = row.id;
	editTokenHint.value = row.hasToken ? "已配置（输入新值可覆盖，留空保持不变）" : "GitHub Personal Access Token（repo 权限）";
	validateResult.value = null;
	form.value = {
		name: row.name,
		localPath: row.localPath,
		remoteUrl: row.remoteUrl,
		token: "",
		branch: row.branch,
		authorName: row.authorName,
		authorEmail: row.authorEmail,
		messageTemplate: row.messageTemplate,
	};
	dialogVisible.value = true;
}

async function validate() {
	validateResult.value = await api.projects.validate(form.value.localPath);
}

async function save() {
	if (!form.value.name.trim() || !form.value.localPath.trim()) {
		ElMessage.warning("请填写名称与本地路径");
		return;
	}
	saving.value = true;
	try {
		if (editId.value) {
			await api.projects.update(editId.value, { ...form.value });
			ElMessage.success("已保存");
		} else {
			await api.projects.create({ ...form.value });
			ElMessage.success("已创建");
		}
		dialogVisible.value = false;
		await load();
		await loadProjects();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		saving.value = false;
	}
}

async function activate(row: ProjectProfile) {
	try {
		await api.projects.activate(row.id);
		await loadProjects();
		activeId.value = projectStore.activeProjectId;
		ElMessage.success(`已切换到「${row.name}」`);
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}

async function remove(row: ProjectProfile) {
	await ElMessageBox.confirm(`确定删除项目「${row.name}」？（只删除后台配置，不影响博客文件）`, "删除确认", { type: "warning" });
	try {
		await api.projects.remove(row.id);
		ElMessage.success("已删除");
		await load();
		await loadProjects();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}
</script>

<style scoped>
.form-tip {
	font-size: 12px;
	line-height: 1.5;
	margin-top: 4px;
}

.form-tip.ok {
	color: var(--el-color-success);
}

.form-tip.bad {
	color: var(--el-color-danger);
}
</style>
