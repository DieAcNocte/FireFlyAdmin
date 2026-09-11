<template>
	<div>
		<div class="toolbar">
			<el-button @click="router.back()">← 返回</el-button>
		</div>

		<ConfigRawEditor v-if="file" :key="file" :file="file" />

		<el-card v-else shadow="never" v-loading="loading">
			<template #header>
				<span>选择要编辑的配置文件</span>
			</template>
			<el-empty v-if="!files.length && !loading" description="没有可编辑的配置文件" />
			<div v-for="f in files" :key="f.file" class="raw-item" @click="router.push({ path: '/configs/raw', query: { file: f.file } })">
				<div>
					<div class="raw-name">{{ f.file }}</div>
					<div class="raw-path">{{ filePath(f.file) }}</div>
				</div>
				<span class="raw-size">{{ (f.size / 1024).toFixed(1) }} KB</span>
			</div>
		</el-card>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import ConfigRawEditor from "../components/ConfigRawEditor.vue";

const route = useRoute();
const router = useRouter();
const file = computed(() => String(route.query.file || ""));

const files = ref<{ file: string; size: number; mtime: number }[]>([]);
const loading = ref(false);

onMounted(async () => {
	if (file.value) return;
	loading.value = true;
	try {
		files.value = (await api.configs.rawList()).files;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
});

function filePath(f: string): string {
	return f.startsWith("data/") ? `src/${f}` : `src/config/${f}`;
}
</script>

<style scoped>
.raw-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 4px;
	border-bottom: 1px solid var(--el-border-color-lighter);
	cursor: pointer;
}

.raw-item:hover {
	background: var(--el-fill-color-light);
}

.raw-name {
	font-weight: 600;
	font-size: 14px;
}

.raw-path {
	color: var(--el-text-color-secondary);
	font-size: 12px;
	margin-top: 2px;
}

.raw-size {
	color: var(--el-text-color-secondary);
	font-size: 12px;
}
</style>
