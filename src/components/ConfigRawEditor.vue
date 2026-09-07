<template>
	<el-card shadow="never" v-loading="loading">
		<template #header>
			<div class="card-header">
				<span style="font-weight: 600">{{ label }}</span>
				<el-button type="primary" :loading="saving" @click="saveRaw">保存</el-button>
			</div>
		</template>
		<div class="code-editor">
			<Codemirror v-model="content" :extensions="jsExtensions" :style="{ height: '100%' }" />
		</div>
	</el-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { Codemirror } from "vue-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { api } from "../api";

const props = defineProps<{ file: string }>();

const content = ref("");
const loading = ref(false);
const saving = ref(false);

const jsExtensions = [javascript({ typescript: true })];

const label = computed(() => {
	const f = props.file;
	if (f.startsWith("data/")) return `src/${f}`;
	return `src/config/${f}`;
});

watch(() => props.file, load, { immediate: true });

async function load() {
	loading.value = true;
	try {
		const res = await api.configs.rawGet(props.file);
		content.value = res.content;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

async function saveRaw() {
	saving.value = true;
	try {
		await api.configs.rawSave(props.file, content.value);
		ElMessage.success("已保存");
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		saving.value = false;
	}
}
</script>

<style scoped>
.card-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
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
