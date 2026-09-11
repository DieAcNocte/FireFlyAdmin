<template>
	<!-- 连接配置（未配置 / 连不上 / 未授权时全屏显示） -->
	<ServerConnect v-if="showConnect" :reason="connectReason" />
	<!-- 首次使用：初始设置向导 -->
	<SetupWizard v-else-if="showWizard" @finished="onWizardFinished" />
	<el-config-provider v-else :size="isMobile ? 'small' : 'default'">
		<el-container class="layout" :class="{ 'is-mobile': isMobile }">
			<el-aside v-if="!isMobile" width="210px" class="aside">
				<div class="brand">
					<img v-if="!iconFailed" :src="brandIconUrl" class="brand-icon" alt="" @error="iconFailed = true" />
					<span v-else class="brand-icon">🔥</span>
					<span>FireFly管理后台</span>
				</div>
				<el-menu :default-active="route.path" router class="menu">
					<el-menu-item v-for="item in visibleMenu" :key="item.path" :index="item.path">
						<el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span>
					</el-menu-item>
				</el-menu>
			</el-aside>
			<el-container>
				<el-header class="header" height="56px">
					<div class="header-left">
						<el-button v-if="isMobile" class="menu-btn" text @click="menuOpen = true">
							<el-icon :size="20"><Menu /></el-icon>
						</el-button>
						<img v-if="isMobile && !iconFailed" :src="brandIconUrl" class="brand-icon" alt="" @error="iconFailed = true" />
						<span v-else-if="isMobile" class="brand-icon">🔥</span>
						<span v-if="isMobile" class="brand-name">FireFly</span>
						<span v-if="!isMobile" class="header-label">当前项目</span>
						<el-select
							v-if="!isGithubMode()"
							:model-value="projectStore.activeProjectId"
							class="project-select"
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
						<el-tooltip v-if="activeProject && !isMobile" :content="activeProject.localPath" placement="bottom">
							<el-tag type="info" effect="plain" size="small" class="path-tag">{{ activeProject.localPath }}</el-tag>
						</el-tooltip>
						<el-tag
							v-if="themeLabel && !isMobile"
							:type="projectStore.theme?.theme === 'unknown' ? 'warning' : 'success'"
							effect="plain"
							size="small"
						>
							{{ themeLabel }}
						</el-tag>
					</div>
					<div class="header-right">
						<template v-if="!isGithubMode()">
							<el-tag v-if="devRunning" type="success" effect="dark" size="small" class="dev-tag">预览运行中</el-tag>
							<el-button size="small" :type="devRunning ? 'danger' : 'primary'" :plain="!devRunning" @click="toggleDev">
								<el-icon v-if="devRunning"><CircleCloseFilled /></el-icon>
								<el-icon v-else><VideoPlay /></el-icon>
								{{ devRunning ? "关闭预览" : "启动预览" }}
							</el-button>
							<el-button size="small" tag="a" href="http://localhost:4321/" target="_blank" class="open-blog">打开博客 ↗</el-button>
						</template>
						<el-tag
							v-else-if="themeLabel"
							:type="projectStore.theme?.theme === 'unknown' ? 'warning' : 'success'"
							effect="plain"
							size="small"
						>
							{{ themeLabel }}
						</el-tag>
					</div>
				</el-header>
				<el-main class="main">
					<router-view v-if="projectStore.loaded" :key="projectStore.activeProjectId" />
				</el-main>
			</el-container>
		</el-container>
		<!-- 移动端抽屉导航 -->
		<el-drawer v-if="isMobile" v-model="menuOpen" direction="ltr" size="250px" :with-header="false" class="nav-drawer">
			<div class="brand drawer-brand">
				<img v-if="!iconFailed" :src="brandIconUrl" class="brand-icon" alt="" @error="iconFailed = true" />
				<span v-else class="brand-icon">🔥</span>
				<span>FireFly管理后台</span>
			</div>
			<el-menu :default-active="route.path" router class="drawer-menu" @select="menuOpen = false">
				<el-menu-item v-for="item in visibleMenu" :key="item.path" :index="item.path">
					<el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span>
				</el-menu-item>
			</el-menu>
		</el-drawer>
	</el-config-provider>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { App as CapApp } from "@capacitor/app";
import { projectStore, activeProject, loadProjects, switchProject, refreshTheme } from "./stores/project";
import { api } from "./api";
import { isNative, isMobile, isGithubMode, skipped, unauthorized, needsConnectConfig, deviceColorMode, apiUrl } from "./api/base";
import { applyColorMode } from "./theme";
import SetupWizard from "./views/SetupWizard.vue";
import ServerConnect from "./components/ServerConnect.vue";

const route = useRoute();
const router = useRouter();
const devRunning = ref(false);
const showWizard = ref(false);
const iconFailed = ref(false);
const menuOpen = ref(false);
const showConnect = ref(false);
const connectReason = ref<"unconfigured" | "unreachable" | "unauthorized">("unconfigured");
const brandIconUrl = computed(() => apiUrl("/api/app/icon"));

const menuItems = [
	{ path: "/dashboard", label: "仪表盘", icon: "Odometer" },
	{ path: "/posts", label: "文章管理", icon: "Document" },
	{ path: "/dynamics", label: "动态管理", icon: "ChatDotRound" },
	{ path: "/gallery", label: "相册管理", icon: "Picture" },
	{ path: "/wallpaper", label: "主页图片", icon: "Monitor" },
	{ path: "/pages", label: "页面管理", icon: "Files" },
	{ path: "/configs", label: "站点配置", icon: "Setting" },
	{ path: "/publish", label: "发布", icon: "UploadFilled" },
	{ path: "/settings", label: "项目管理", icon: "FolderOpened" },
	{ path: "/preferences", label: "应用设置", icon: "Tools" },
];

/** 仅电脑端服务模式可用的页面（GitHub 直连模式隐藏；发布的直连版尚未实现——直连下保存即提交） */
const SERVER_ONLY_PATHS = new Set(["/publish", "/settings"]);

const visibleMenu = computed(() => {
	// 手机端：页面管理并入站点配置（二级菜单），不在侧边栏单独显示
	const base = isMobile ? menuItems.filter((i) => i.path !== "/pages") : menuItems;
	if (!isGithubMode()) {
		// 原生壳始终提供连接设置入口（补充/切换连接方式），桌面网页不需要
		return isNative ? base.concat([{ path: "/connect", label: "连接设置", icon: "Connection" }]) : base;
	}
	return base
		.filter((i) => !SERVER_ONLY_PATHS.has(i.path))
		.concat([{ path: "/connect", label: "连接设置", icon: "Connection" }]);
});

const THEME_LABELS: Record<string, string> = { firefly: "FireFly", mizuki: "Mizuki", fuwari: "Fuwari", unknown: "未知主题" };
const themeLabel = computed(() => {
	const t = projectStore.theme?.theme;
	return t ? THEME_LABELS[t] ?? t : "";
});

// 服务端中途开启/更换访问令牌时，弹出连接配置屏
watch(unauthorized, (v) => {
	if (v) {
		connectReason.value = "unauthorized";
		showConnect.value = true;
	}
});

onMounted(async () => {
	window.addEventListener("project-switched", refreshTheme);
	registerBackButton();
	if (needsConnectConfig()) {
		connectReason.value = "unconfigured";
		showConnect.value = true;
		return;
	}
	if (isGithubMode()) {
		// 直连模式：无项目/向导/dev server 概念，主题能力来自仓库文件探测
		try {
			await refreshTheme();
		} catch {
			connectReason.value = "unreachable";
			showConnect.value = true;
			return;
		}
		applyColorMode(deviceColorMode.value); // 手机本地配色偏好
		projectStore.loaded = true;
		return;
	}
	try {
		await loadProjects();
		await applySetupState();
		refreshDev();
	} catch {
		// 原生壳连不上服务器，或服务端要求令牌：进入连接配置（用户选择跳过预览时除外）
		if (skipped.value) {
			// 预览模式：主界面照常渲染，各页面自行展示空状态/连接错误
			projectStore.loaded = true;
			return;
		}
		if (unauthorized.value) connectReason.value = "unauthorized";
		else if (isNative) connectReason.value = "unreachable";
		if (showConnect.value === false && (unauthorized.value || isNative)) showConnect.value = true;
	}
});

/** Android 物理返回键：先关抽屉，再路由回退，栈底退出应用 */
function registerBackButton() {
	if (!isNative) return;
	CapApp.addListener("backButton", () => {
		if (menuOpen.value) {
			menuOpen.value = false;
			return;
		}
		const back = (window.history.state as { back?: string } | null)?.back;
		if (back) router.back();
		else CapApp.exitApp();
	});
}

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

.drawer-brand {
	padding-top: 8px;
}

.menu {
	border-right: none;
	flex: 1;
}

.drawer-menu {
	border-right: none;
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

.brand-name {
	font-weight: 700;
	font-size: 15px;
	color: #303133;
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

/* ── 移动端布局 ── */
.layout.is-mobile .header {
	height: 52px;
	padding: 0 10px;
}

.layout.is-mobile .main {
	padding: 12px;
	padding-bottom: calc(12px + env(safe-area-inset-bottom));
}

.layout.is-mobile .project-select {
	width: auto !important;
	flex: 1;
	min-width: 0;
	max-width: 160px;
}

.layout.is-mobile .header-right {
	gap: 6px;
}

.layout.is-mobile .dev-tag,
.layout.is-mobile .path-tag,
.layout.is-mobile .open-blog {
	display: none;
}

.menu-btn {
	padding: 6px;
	margin-right: -2px;
}
</style>
