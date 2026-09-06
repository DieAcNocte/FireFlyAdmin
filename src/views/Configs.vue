<template>
	<div class="configs-layout">
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
			<!-- 可视化表单 -->
			<template v-if="mode === 'form' && currentEntry">
				<el-card shadow="never" v-loading="formLoading">
					<template #header>
						<div class="card-header">
							<div>
								<span style="font-weight: 600">{{ currentEntry.title }}</span>
								<span class="desc">{{ currentEntry.description }}</span>
							</div>
							<el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
						</div>
					</template>
					<el-form label-width="150px">
						<template v-for="f in formValues" :key="f.path">
							<el-form-item :label="f.label">
								<el-alert v-if="f.readError" type="warning" :closable="false" :title="`无法解析：${f.readError}`" style="width: 100%" />
								<template v-else>
									<el-input v-if="f.type === 'string'" v-model="f.value as string" />
									<el-input v-else-if="f.type === 'text'" v-model="f.value as string" type="textarea" :rows="3" />
									<el-input-number v-else-if="f.type === 'number'" v-model="f.value as number" style="width: 200px" />
									<el-switch v-else-if="f.type === 'boolean'" v-model="f.value as boolean" />
									<el-select v-else-if="f.type === 'select'" v-model="f.value" style="width: 240px">
										<el-option v-for="o in f.options" :key="o" :label="o" :value="o" />
									</el-select>
									<!-- 字符串数组 -->
									<div v-else-if="f.type === 'stringArray'" class="list-editor">
										<div v-for="(_, i) in f.value as string[]" :key="i" class="list-row">
											<el-input v-model="(f.value as string[])[i]" />
											<el-button text type="danger" @click="(f.value as string[]).splice(i, 1)">删除</el-button>
										</div>
										<el-button size="small" @click="(f.value as string[]).push('')">+ 添加</el-button>
									</div>
									<!-- 对象数组 -->
									<el-table v-else-if="f.type === 'arrayOfObjects'" :data="f.value as Record<string, unknown>[]" size="small" border>
										<el-table-column v-for="itemF in f.itemFields" :key="itemF.key" :label="itemF.label" :min-width="itemF.type === 'text' ? 180 : 130">
											<template #default="{ row }">
												<el-switch v-if="itemF.type === 'boolean'" v-model="row[itemF.key]" />
												<el-input v-else type="textarea" :rows="itemF.type === 'text' ? 2 : 1" v-model="row[itemF.key]" :placeholder="itemF.placeholder" />
											</template>
										</el-table-column>
										<el-table-column label="" width="60">
											<template #default="{ $index }">
												<el-button size="small" text type="danger" @click="(f.value as Record<string, unknown>[]).splice($index, 1)">删</el-button>
											</template>
										</el-table-column>
									</el-table>
									<el-button v-if="f.type === 'arrayOfObjects'" size="small" style="margin-top: 8px" @click="addRow(f)">
										+ 添加一项
									</el-button>
									<div v-else-if="f.type === 'wallpaperDesktop' || f.type === 'wallpaperMobile'" class="tip">
										请前往「主页图片」页面管理壁纸
									</div>
									<div v-if="f.tip" class="tip">{{ f.tip }}</div>
								</template>
							</el-form-item>
						</template>
					</el-form>
				</el-card>
			</template>

			<!-- 源码编辑 -->
			<template v-else-if="mode === 'raw' && rawFile">
				<el-card shadow="never">
					<template #header>
						<div class="card-header">
							<span style="font-weight: 600">src/config/{{ rawFile.file }}</span>
							<el-button type="primary" :loading="saving" @click="saveRaw">保存</el-button>
						</div>
					</template>
					<div class="code-editor">
						<Codemirror v-model="rawFile.content" :extensions="jsExtensions" :style="{ height: '100%' }" />
					</div>
				</el-card>
			</template>

			<el-empty v-else description="从左侧选择一个配置项" />
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { Codemirror } from "vue-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { api, type ConfigEntry, type FieldSpec } from "../api";

const entries = ref<ConfigEntry[]>([]);
const rawFiles = ref<{ file: string; size: number; mtime: number }[]>([]);
const activeKey = ref("");
const mode = ref<"none" | "form" | "raw">("none");
const currentEntry = ref<ConfigEntry | null>(null);
const formValues = ref<(FieldSpec & { value: unknown })[]>([]);
const formLoading = ref(false);
const rawFile = ref<{ file: string; content: string } | null>(null);
const saving = ref(false);

const jsExtensions = [javascript({ typescript: true })];

onMounted(async () => {
	try {
		const [entryRes, rawRes] = await Promise.all([api.configs.entries(), api.configs.rawList()]);
		entries.value = entryRes.entries;
		rawFiles.value = rawRes.files;
		if (entries.value.length) onSelect(`form:${entries.value[0].file}`);
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
});

async function onSelect(key: string) {
	activeKey.value = key;
	const [kind, name] = key.split(":");
	if (kind === "form") {
		mode.value = "form";
		await loadForm(name);
	} else if (kind === "raw") {
		mode.value = "raw";
		formLoading.value = true;
		try {
			rawFile.value = await api.configs.rawGet(name);
		} catch (e) {
			ElMessage.error(e instanceof Error ? e.message : String(e));
		} finally {
			formLoading.value = false;
		}
	}
}

async function loadForm(file: string) {
	formLoading.value = true;
	try {
		const res = await api.configs.get(file);
		currentEntry.value = entries.value.find((e) => e.file === file) ?? null;
		formValues.value = res.fields.map((f) => ({ ...f }));
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		formLoading.value = false;
	}
}

function addRow(f: FieldSpec & { value: unknown }) {
	const row: Record<string, unknown> = {};
	for (const itemF of f.itemFields ?? []) {
		if (itemF.type === "boolean") row[itemF.key] = false;
		else if (itemF.type === "number") row[itemF.key] = 0;
		else if (itemF.type === "stringArray") row[itemF.key] = [];
		else row[itemF.key] = "";
	}
	(f.value as Record<string, unknown>[]).push(row);
}

async function saveForm() {
	if (!currentEntry.value) return;
	saving.value = true;
	try {
		await api.configs.saveFields(
			currentEntry.value.file,
			formValues.value
				.filter((f) => !f.readError)
				.map((f) => ({ path: f.path, value: f.value }))
		);
		ElMessage.success("已保存，建议重启博客 dev server 使配置生效");
		await loadForm(currentEntry.value.file);
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		saving.value = false;
	}
}

async function saveRaw() {
	if (!rawFile.value) return;
	saving.value = true;
	try {
		await api.configs.rawSave(rawFile.value.file, rawFile.value.content);
		ElMessage.success("已保存");
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		saving.value = false;
	}
}
</script>

<style scoped>
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

.desc {
	margin-left: 12px;
	color: #909399;
	font-size: 12px;
}

.card-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.list-editor {
	width: 100%;
}

.list-row {
	display: flex;
	gap: 8px;
	margin-bottom: 6px;
}

.tip {
	color: #909399;
	font-size: 12px;
	line-height: 1.5;
	margin-top: 4px;
	width: 100%;
}

.code-editor {
	height: calc(100vh - 220px);
	border: 1px solid #e4e7ed;
	border-radius: 4px;
	overflow: hidden;
}

:deep(.cm-editor) {
	height: 100%;
}
</style>
