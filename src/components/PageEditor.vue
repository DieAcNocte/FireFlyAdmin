<template>
	<div v-loading="loading">
		<div class="toolbar">
			<span class="col-title">src/content/spec/{{ file }}</span>
			<div class="spacer" />
			<el-button type="primary" :loading="saving" @click="save">保存</el-button>
		</div>
		<div class="code-editor">
			<Codemirror v-model="content" :extensions="ext" :style="{ height: '100%' }" />
		</div>
		<el-alert type="info" :closable="false" style="margin-top: 12px" title="整文件编辑（含 frontmatter），保存后页面立即生效" />
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { Codemirror } from "vue-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { api } from "../api";

const props = defineProps<{ file: string }>();

const content = ref("");
const loading = ref(false);
const saving = ref(false);

const ext = computed(() =>
	props.file.endsWith(".mdx") ? [markdown(), javascript({ typescript: true })] : [markdown()]
);

watch(() => props.file, load, { immediate: true });

async function load() {
	loading.value = true;
	try {
		const res = await api.pages.detail(props.file);
		content.value = res.content;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

async function save() {
	saving.value = true;
	try {
		await api.pages.save(props.file, content.value);
		ElMessage.success("已保存");
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		saving.value = false;
	}
}
</script>

<style scoped>
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
