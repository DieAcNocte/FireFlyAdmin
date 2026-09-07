<template>
	<!-- 手机端：二级列表，点击进入独立编辑页 -->
	<div v-if="isMobile" v-loading="loading" class="hub">
		<div class="hub-title">页面管理</div>
		<div class="hub-hint">编辑 src/content/spec 下的单页（about / guestbook / friends 等），整文件含 frontmatter</div>
		<el-card v-for="p in pages" :key="p.file" shadow="never" class="hub-item" @click="router.push({ path: '/pages/edit', query: { file: p.file } })">
			<div class="hub-row">
				<div>
					<div class="hub-name">{{ p.name }}</div>
					<div class="hub-desc">src/content/spec/{{ p.file }}</div>
				</div>
				<el-icon class="hub-arrow"><ArrowRight /></el-icon>
			</div>
		</el-card>
	</div>

	<!-- 电脑端：保持左侧菜单 + 右侧编辑器布局 -->
	<div v-else class="pages-layout" v-loading="loading">
		<div class="side">
			<el-menu :default-active="activeFile" @select="activeFile = $event">
				<el-menu-item v-for="p in pages" :key="p.file" :index="p.file">
					<el-icon><Document /></el-icon>
					<span>{{ p.name }}</span>
					<el-tag size="small" effect="plain" style="margin-left: auto">{{ p.ext }}</el-tag>
				</el-menu-item>
			</el-menu>
		</div>
		<div class="main-panel">
			<PageEditor v-if="activeFile" :key="activeFile" :file="activeFile" />
			<el-empty v-else description="从左侧选择一个页面（about / guestbook / friends / site）" />
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { ArrowRight, Document } from "@element-plus/icons-vue";
import { api, type SpecPage } from "../api";
import { isMobile } from "../api/base";
import PageEditor from "../components/PageEditor.vue";

const route = useRoute();
const router = useRouter();
const pages = ref<SpecPage[]>([]);
const activeFile = ref("");
const loading = ref(false);

onMounted(async () => {
	try {
		pages.value = (await api.pages.list()).pages;
		const initial = String(route.query.file || "");
		if (!isMobile && initial && pages.value.some((p) => p.file === initial)) activeFile.value = initial;
		else if (!isMobile && pages.value.length) activeFile.value = pages.value[0].file;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
});
</script>

<style scoped>
.hub-title {
	font-weight: 600;
	margin: 4px 0 6px;
}

.hub-hint {
	color: #909399;
	font-size: 12px;
	line-height: 1.6;
	margin-bottom: 12px;
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

.pages-layout {
	display: flex;
	gap: 16px;
	align-items: flex-start;
}

.side {
	width: 220px;
	flex-shrink: 0;
	background: #fff;
	border: 1px solid #e4e7ed;
	border-radius: 6px;
	padding: 8px 0;
}

.main-panel {
	flex: 1;
	min-width: 0;
}
</style>
