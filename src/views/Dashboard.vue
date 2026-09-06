<template>
	<div>
		<el-row :gutter="16">
			<el-col :span="6">
				<el-card shadow="never">
					<el-statistic title="文章" :value="ov?.counts.posts ?? 0" />
					<div class="stat-extra">
						<el-link type="primary" @click="$router.push('/posts')">管理文章</el-link>
					</div>
				</el-card>
			</el-col>
			<el-col :span="6">
				<el-card shadow="never">
					<el-statistic title="动态" :value="ov?.counts.dynamics ?? 0" />
					<div class="stat-extra">
						<el-link type="primary" @click="$router.push('/dynamics')">发布动态</el-link>
					</div>
				</el-card>
			</el-col>
			<el-col :span="6">
				<el-card shadow="never">
					<el-statistic title="相册" :value="ov?.counts.albums ?? 0" />
					<div class="stat-extra">
						<el-link type="primary" @click="$router.push('/gallery')">管理相册</el-link>
					</div>
				</el-card>
			</el-col>
			<el-col :span="6">
				<el-card shadow="never">
					<el-statistic title="壁纸（桌面/移动）" :value="`${ov?.counts.desktopWallpapers ?? 0} / ${ov?.counts.mobileWallpapers ?? 0}`" />
					<div class="stat-extra">
						<el-link type="primary" @click="$router.push('/wallpaper')">管理壁纸</el-link>
					</div>
				</el-card>
			</el-col>
		</el-row>

		<el-card shadow="never" class="page-card" style="margin-top: 16px">
			<template #header>
				<div class="card-header">
					<span>当前项目</span>
				</div>
			</template>
			<el-descriptions :column="2" border v-if="ov">
				<el-descriptions-item label="名称">{{ ov.project.name }}</el-descriptions-item>
				<el-descriptions-item label="分支">{{ ov.git?.branch || ov.project.branch }}</el-descriptions-item>
				<el-descriptions-item label="本地路径" :span="2">{{ ov.project.localPath }}</el-descriptions-item>
				<el-descriptions-item label="远程仓库" :span="2">
					<template v-if="ov.project.remoteUrl">{{ ov.project.remoteUrl }}</template>
					<el-tag v-else type="warning" size="small">未配置（发布前请在项目管理中填写）</el-tag>
				</el-descriptions-item>
			</el-descriptions>
		</el-card>

		<el-card shadow="never" class="page-card">
			<template #header>
				<div class="card-header">
					<span>Git 状态</span>
					<el-button size="small" @click="load">刷新</el-button>
				</div>
			</template>
			<template v-if="ov?.git">
				<el-alert
					v-if="ov.git.changed > 0"
					type="warning"
					:closable="false"
					:title="`有 ${ov.git.changed} 个文件变更未提交`"
				>
					<el-button size="small" type="primary" @click="$router.push('/publish')">去发布</el-button>
				</el-alert>
				<el-alert v-else type="success" :closable="false" title="工作区干净，没有未提交的变更" />
			</template>
			<el-alert v-else type="error" :closable="false" title="无法读取 git 状态（目录可能不是 git 仓库）" />
		</el-card>

		<el-card shadow="never">
			<template #header>
				<div class="card-header">
					<span>博客预览</span>
					<el-button size="small" :type="ov?.dev.running ? 'danger' : 'primary'" @click="toggleDev">
						{{ ov?.dev.running ? "停止" : "启动" }}
					</el-button>
				</div>
			</template>
			<p style="margin: 0 0 8px; color: #606266">
				在项目目录运行 <code>pnpm dev</code>，预览地址
				<a href="http://localhost:4321/" target="_blank">http://localhost:4321/</a>。
				修改 src/config 配置后需重启 dev server 才能生效。
			</p>
			<div v-if="ov?.dev.logs?.length" class="log-view">{{ ov.dev.logs.join("\n") }}</div>
		</el-card>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api";

type Overview = Awaited<ReturnType<typeof api.overview>>;
const ov = ref<Overview | null>(null);

onMounted(load);

async function load() {
	try {
		ov.value = await api.overview();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}

async function toggleDev() {
	try {
		const running = ov.value?.dev.running ?? false;
		await api.blog[running ? "devStop" : "devStart"]();
		await load();
		ElMessage.success(running ? "已停止" : "已启动");
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}
</script>
