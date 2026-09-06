<template>
	<!-- 首次使用：初始设置向导 -->
	<SetupWizard v-if="showWizard" @finished="onWizardFinished" />
	<el-container v-else class="layout">
		<el-aside width="210px" class="aside">
			<div class="brand">
				<img v-if="!iconFailed" :src="brandIconUrl" class="brand-icon" alt="" @error="iconFailed = true" />
				<span v-else class="brand-icon">🔥</span>
				<span>FireFly管理后台</span>
			</div>
			<el-menu :default-active="route.path" router class="menu">
				<el-menu-item index="/dashboard">
					<el-icon><Odometer /></el-icon><span>仪表盘</span>
				</el-menu-item>
				<el-menu-item index="/posts">
					<el-icon><Document /></el-icon><span>文章管理</span>
				</el-menu-item>
				<el-menu-item index="/dynamics">
					<el-icon><ChatDotRound /></el-icon><span>动态管理</span>
				</el-menu-item>
				<el-menu-item index="/gallery">
					<el-icon><Picture /></el-icon><span>相册管理</span>
				</el-menu-item>
				<el-menu-item index="/wallpaper">
					<el-icon><Monitor /></el-icon><span>主页图片</span>
				</el-menu-item>
				<el-menu-item index="/pages">
					<el-icon><Files /></el-icon><span>页面管理</span>
				</el-menu-item>
				<el-menu-item index="/configs">
					<el-icon><Setting /></el-icon><span>站点配置</span>
				</el-menu-item>
				<el-menu-item index="/publish">
					<el-icon><UploadFilled /></el-icon><span>发布</span>
				</el-menu-item>
				<el-menu-item index="/settings">
					<el-icon><FolderOpened /></el-icon><span>项目管理</span>
				</el-menu-item>
				<el-menu-item index="/preferences">
					<el-icon><Tools /></el-icon><span>应用设置</span>
				</el-menu-item>
			</el-menu>
		</el-aside>
		<el-container>
			<el-header class="header" height="56px">
				<div class="header-left">
					<span class="header-label">当前项目</span>
					<el-select
						:model-value="projectStore.activeProjectId"
						style="width: 220px"
						placeholder="选择项目"
						@change="onSwitch"
					>
						<el-option
							v-for="p in projectStore.projects"
							:key="p.id"
							:label="p.name"
							:value="p.id"
						/>
					</el-select>
					<el-tooltip v-if="activeProject" :content="activeProject.localPath" placement="bottom">
						<el-tag type="info" effect="plain" size="small" class="path-tag">{{ activeProject.localPath }}</el-tag>
					</el-tooltip>
				</div>
				<div class="header-right">
					<el-tag v-if="devRunning" type="success" effect="dark" size="small">预览运行中</el-tag>
					<el-button size="small" :type="devRunning ? 'danger' : 'primary'" :plain="!devRunning" @click="toggleDev">
						<el-icon v-if="devRunning"><CircleCloseFilled /></el-icon>
						<el-icon v-else><VideoPlay /></el-icon>
						{{ devRunning ? "关闭预览" : "启动预览" }}
					</el-button>
					<el-button size="small" tag="a" href="http://localhost:4321/" target="_blank">打开博客 ↗</el-button>
				</div>
			</el-header>
			<el-main class="main">
				<router-view v-if="projectStore.loaded" :key="projectStore.activeProjectId" />
			</el-main>
		</el-container>
	</el-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import { projectStore, activeProject, loadProjects, switchProject } from "./stores/project";
import { api } from "./api";
import { applyColorMode } from "./theme";
import SetupWizard from "./views/SetupWizard.vue";

const route = useRoute();
const devRunning = ref(false);
const showWizard = ref(false);
const iconFailed = ref(false);
const brandIconUrl = "/api/app/icon";

onMounted(async () => {
	await loadProjects();
	await applySetupState();
	refreshDev();
});

/** 读取偏好与向导状态：未完成初始设置时显示向导 */
async function applySetupState() {
	try {
		const st = await api.setup.status();
		if (!st.setupCompleted) {
			showWizard.value = true;
			return;
		}
	} catch {
		/* 状态读取失败则按已完成处理 */
	}
	try {
		const p = await api.app.prefs();
		applyColorMode(p.colorMode);
	} catch {
		/* ignore */
	}
}

async function onWizardFinished() {
	showWizard.value = false;
	try {
		const p = await api.app.prefs();
		applyColorMode(p.colorMode);
	} catch {
		/* ignore */
	}
	ElMessage.success("初始设置完成，欢迎使用！");
}

async function refreshDev() {
	try {
		const st = await api.blog.devStatus();
		devRunning.value = st.running;
	} catch {
		/* ignore */
	}
}

async function onSwitch(id: string) {
	try {
		await switchProject(id);
		ElMessage.success("已切换项目");
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}

async function toggleDev() {
	try {
		const st = devRunning.value ? await api.blog.devStop() : await api.blog.devStart();
		devRunning.value = st.running;
		ElMessage.success(devRunning.value ? "博客 dev server 已启动" : "已停止");
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}
</script>

<style scoped>
.layout {
	height: 100%;
}

.aside {
	background: #fff;
	border-right: 1px solid #e4e7ed;
	display: flex;
	flex-direction: column;
}

.brand {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 700;
	font-size: 15px;
	padding: 18px 16px 14px;
	color: #303133;
}

.menu {
	border-right: none;
	flex: 1;
}

.brand-icon {
	width: 20px;
	height: 20px;
	object-fit: contain;
	flex-shrink: 0;
	font-size: 16px;
	line-height: 1;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	background: #fff;
	border-bottom: 1px solid #e4e7ed;
}

.header-left {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.header-label {
	color: #909399;
	font-size: 13px;
	white-space: nowrap;
}

.path-tag {
	max-width: 320px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.header-right {
	display: flex;
	align-items: center;
	gap: 10px;
}

.main {
	padding: 20px;
	overflow: auto;
}
</style>
