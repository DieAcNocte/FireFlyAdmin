<template>
	<div>
		<el-alert
			v-if="isGithubMode() && !ghConfig.token"
			type="info"
			:closable="false"
			show-icon
			title="当前为内置 FireFly 模板（离线只读快照）"
			description="在菜单「连接设置」中换成你自己的博客仓库并填写 PAT，即可开始写内容。"
			class="page-card"
		/>
		<!-- 手机：文章/动态/相册一排三张，壁纸独占一排；电脑：一行四张 -->
		<el-row :gutter="16">
			<el-col :xs="8" :md="6">
				<el-card shadow="never">
					<el-statistic title="文章" :value="ov?.counts.posts ?? 0" />
					<div class="stat-extra">
						<el-link type="primary" @click="$router.push('/posts')">管理文章</el-link>
					</div>
				</el-card>
			</el-col>
			<el-col :xs="8" :md="6">
				<el-card shadow="never">
					<el-statistic :title="ov?.theme === 'mizuki' ? '日记' : '动态'" :value="ov?.counts.dynamics ?? 0" />
					<div class="stat-extra">
						<el-link type="primary" @click="$router.push('/dynamics')">{{ ov?.theme === 'mizuki' ? '管理日记' : '发布动态' }}</el-link>
					</div>
				</el-card>
			</el-col>
			<el-col :xs="8" :md="6">
				<el-card shadow="never">
					<el-statistic title="相册" :value="ov?.counts.albums ?? 0" />
					<div class="stat-extra">
						<el-link type="primary" @click="$router.push('/gallery')">管理相册</el-link>
					</div>
				</el-card>
			</el-col>
			<el-col :xs="24" :md="6">
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
					<span>仓库信息</span>
				</div>
			</template>
			<el-descriptions :column="2" border v-if="ov">
				<el-descriptions-item label="名称">{{ ov.project.name }}</el-descriptions-item>
				<el-descriptions-item label="分支">{{ ov.git?.branch || ov.project.branch }}</el-descriptions-item>
				<el-descriptions-item v-if="!isGithubMode()" label="本地路径" :span="2">{{ ov.project.localPath }}</el-descriptions-item>
				<el-descriptions-item label="远程仓库" :span="2">
					<template v-if="ov.project.remoteUrl">{{ ov.project.remoteUrl }}</template>
					<el-tag v-else type="warning" size="small">未配置（发布前请在项目管理中填写）</el-tag>
				</el-descriptions-item>
			</el-descriptions>
		</el-card>

		<el-card shadow="never" class="page-card">
			<template #header>
				<div class="card-header">
					<span>{{ isGithubMode() ? "最近提交" : "Git 状态" }}</span>
					<el-button size="small" @click="load">刷新</el-button>
				</div>
			</template>
			<template v-if="isGithubMode()">
				<el-empty v-if="!ov?.commits?.length" description="暂无提交记录" :image-size="60" />
				<div v-for="c in ov?.commits ?? []" :key="c.hash" class="commit-row">
					<el-tag size="small" effect="plain" class="commit-hash">{{ c.hash }}</el-tag>
					<span class="commit-msg">{{ c.message }}</span>
					<span class="commit-meta">{{ c.author }} · {{ fmtDate(c.date) }}</span>
				</div>
			</template>
			<template v-else-if="ov?.git">
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

		<el-card v-if="!isGithubMode()" shadow="never">
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
import { ghConfig, isGithubMode } from "../api/base";

type Overview = Awaited<ReturnType<typeof api.overview>>;
const ov = ref<Overview | null>(null);

onMounted(load);

function fmtDate(iso: string): string {
	return (iso || "").slice(0, 10);
}

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

<style scoped>
.commit-row {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 0;
	border-bottom: 1px solid var(--el-border-color-lighter);
}

.commit-row:last-child {
	border-bottom: none;
}

.commit-hash {
	font-family: Consolas, Monaco, monospace;
	flex-shrink: 0;
}

.commit-msg {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.commit-meta {
	color: var(--el-text-color-secondary);
	font-size: 12px;
	flex-shrink: 0;
}
</style>
