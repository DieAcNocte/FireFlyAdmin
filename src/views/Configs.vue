<template>
	<!-- 手机端：二级菜单 hub，点击进入独立编辑页 -->
	<div v-if="isMobile" v-loading="loading" class="hub">
		<div class="hub-title">可视化配置</div>
		<el-card v-for="e in entries" :key="e.file" shadow="never" class="hub-item" @click="router.push({ path: '/configs/edit', query: { file: e.file } })">
			<div class="hub-row">
				<div>
					<div class="hub-name">{{ e.title }}</div>
					<div class="hub-desc">{{ e.description }}</div>
				</div>
				<el-icon class="hub-arrow"><ArrowRight /></el-icon>
			</div>
		</el-card>
		<div class="hub-title">源码编辑（全部配置文件）</div>
		<el-card shadow="never" class="hub-item" @click="router.push('/configs/raw')">
			<div class="hub-row">
				<div>
					<div class="hub-name">源码编辑</div>
					<div class="hub-desc">{{ rawFiles.length }} 个配置文件，直接修改 TypeScript 源码</div>
				</div>
				<el-icon class="hub-arrow"><ArrowRight /></el-icon>
			</div>
		</el-card>
		<div class="hub-title">页面管理</div>
		<el-card shadow="never" class="hub-item" @click="router.push('/pages')">
			<div class="hub-row">
				<div>
					<div class="hub-name">页面管理</div>
					<div class="hub-desc">编辑 about / guestbook / friends 等单页（src/content/spec）</div>
				</div>
				<el-icon class="hub-arrow"><ArrowRight /></el-icon>
			</div>
		</el-card>
	</div>

	<!-- 电脑端：保持左侧菜单 + 右侧面板的布局 -->
	<div v-else class="configs-layout" v-loading="loading">
		<div class="side">
			<div class="side-title">可视化配置</div>
			<el-menu :default-active="activeKey" @select="onSelect">
				<el-menu-item v-for="e in entries" :key="e.file" :index="`form:${e.file}`">
					<el-icon><MagicStick /></el-icon>
					<span>{{ e.title }}</span>
				</el-menu-item>
			</el-menu>
			<el-divider>源码编辑（全部配置文件）</el-divider>
			<el-menu :default-active="activeKey" @select="onSelect">
				<el-menu-item v-for="f in rawFiles" :key="f.file" :index="`raw:${f.file}`">
					<el-icon><Document /></el-icon>
					<span>{{ f.file }}</span>
				</el-menu-item>
			</el-menu>
		</div>

		<div class="main-panel">
			<ConfigForm v-if="activeKind === 'form' && activeName" :key="activeName" :file="activeName" />
			<ConfigRawEditor v-else-if="activeKind === 'raw' && activeName" :key="activeName" :file="activeName" />
			<el-empty v-else description="从左侧选择一个配置项" />
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import { ArrowRight, Document, MagicStick } from "@element-plus/icons-vue";
import { api, type ConfigEntry } from "../api";
import { isMobile } from "../api/base";
import ConfigForm from "../components/ConfigForm.vue";
import ConfigRawEditor from "../components/ConfigRawEditor.vue";

const router = useRouter();

const entries = ref<ConfigEntry[]>([]);
const rawFiles = ref<{ file: string; size: number; mtime: number }[]>([]);
const loading = ref(false);
const activeKey = ref("");
const activeKind = ref<"none" | "form" | "raw">("none");
const activeName = ref("");

onMounted(async () => {
	loading.value = true;
	try {
		const [entryRes, rawRes] = await Promise.all([api.configs.entries(), api.configs.rawList()]);
		entries.value = entryRes.entries;
		rawFiles.value = rawRes.files;
		if (!isMobile && entries.value.length) onSelect(`form:${entries.value[0].file}`);
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
});

function onSelect(key: string) {
	activeKey.value = key;
	const [kind, name] = key.split(":");
	activeKind.value = kind as "form" | "raw";
	activeName.value = name;
}
</script>

<style scoped>
.hub-title {
	font-weight: 600;
	margin: 4px 0 10px;
}

.hub-title:not(:first-child) {
	margin-top: 18px;
}

.hub-item {
	cursor: pointer;
	margin-bottom: 10px;
}

.hub-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.hub-name {
	font-weight: 600;
	font-size: 15px;
}

.hub-desc {
	color: #909399;
	font-size: 12px;
	margin-top: 4px;
}

.hub-arrow {
	color: #c0c4cc;
	flex-shrink: 0;
}

.configs-layout {
	display: flex;
	gap: 16px;
	align-items: flex-start;
}

.side {
	width: 240px;
	flex-shrink: 0;
	background: #fff;
	border: 1px solid #e4e7ed;
	border-radius: 6px;
	padding: 8px 0;
}

.side-title {
	font-weight: 600;
	padding: 8px 20px 0;
}

.side .el-divider--horizontal {
	margin: 12px 0;
}

.main-panel {
	flex: 1;
	min-width: 0;
}
</style>
