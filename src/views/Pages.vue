<template>
	<div class="pages-layout">
		<div class="side">
			<el-menu :default-active="String(route.query.file || '')" @select="loadPage">
				<el-menu-item v-for="p in pages" :key="p.file" :index="p.file">
					<el-icon><Document /></el-icon>
					<span>{{ p.name }}</span>
					<el-tag size="small" effect="plain" style="margin-left: auto">{{ p.ext }}</el-tag>
				</el-menu-item>
			</el-menu>
		</div>
		<div class="main-panel" v-loading="loading">
			<template v-if="current">
				<div class="toolbar">
					<span class="col-title">src/content/spec/{{ current.file }}</span>
					<div class="spacer" />
					<el-button type="primary" :loading="saving" @click="save">保存</el-button>
				</div>
				<div class="code-editor">
					<Codemirror v-model="current.content" :extensions="ext" :style="{ height: '100%' }" />
				</div>
				<el-alert type="info" :closable="false" style="margin-top: 12px"
					title="整文件编辑（含 frontmatter），保存后页面立即生效" />
			</template>
			<el-empty v-else description="从左侧选择一个页面（about / guestbook / friends / site）" />
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import { Codemirror } from "vue-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { api, type SpecPage } from "../api";

const route = useRoute();
const pages = ref<SpecPage[]>([]);
const current = ref<{ file: string; content: string } | null>(null);
const loading = ref(false);
const saving = ref(false);

const ext = computed(() =>
	current.value?.file.endsWith(".mdx")
		? [markdown(), javascript({ typescript: true })]
		: [markdown()]
);

onMounted(async () => {
	try {
		pages.value = (await api.pages.list()).pages;
		const initial = String(route.query.file || "");
		if (initial && pages.value.some((p) => p.file === initial)) await loadPage(initial);
		else if (pages.value.length) await loadPage(pages.value[0].file);
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
});

async function loadPage(file: string) {
	loading.value = true;
	try {
		current.value = await api.pages.detail(file);
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

async function save() {
	if (!current.value) return;
	saving.value = true;
	try {
		await api.pages.save(current.value.file, current.value.content);
		ElMessage.success("已保存");
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		saving.value = false;
	}
}
</script>

<style scoped>
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

.col-title {
	font-weight: 600;
}

.code-editor {
	height: calc(100vh - 260px);
	border: 1px solid #e4e7ed;
	border-radius: 4px;
	overflow: hidden;
}

:deep(.cm-editor) {
	height: 100%;
}
</style>
