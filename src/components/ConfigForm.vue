<template>
	<el-card shadow="never" v-loading="loading">
		<template #header>
			<div class="card-header">
				<div>
					<span style="font-weight: 600">{{ entry?.title }}</span>
					<span class="desc">{{ entry?.description }}</span>
				</div>
				<el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
			</div>
		</template>
		<el-form :label-position="isMobile ? 'top' : undefined" label-width="150px">
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
						<template v-else-if="f.type === 'arrayOfObjects'">
							<el-table :data="f.value as Record<string, unknown>[]" size="small" border>
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
							<el-button size="small" style="margin-top: 8px" @click="addRow(f)">+ 添加一项</el-button>
						</template>
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

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { api, type ConfigEntry, type FieldSpec } from "../api";
import { isMobile } from "../api/base";

const props = defineProps<{ file: string }>();

const entry = ref<ConfigEntry | null>(null);
const formValues = ref<(FieldSpec & { value: unknown })[]>([]);
const loading = ref(false);
const saving = ref(false);

watch(() => props.file, loadForm, { immediate: true });

async function loadForm() {
	loading.value = true;
	try {
		const res = await api.configs.get(props.file);
		entry.value = { file: res.file, exportName: res.exportName, title: res.title, fields: [] };
		formValues.value = res.fields.map((f) => ({ ...f }));
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
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
	saving.value = true;
	try {
		await api.configs.saveFields(
			props.file,
			formValues.value
				.filter((f) => !f.readError)
				.map((f) => ({ path: f.path, value: f.value }))
		);
		ElMessage.success("已保存");
		await loadForm();
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

.desc {
	margin-left: 12px;
	color: #909399;
	font-size: 12px;
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
</style>
