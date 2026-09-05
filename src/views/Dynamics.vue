<template>
	<div>
		<div class="toolbar">
			<el-button type="primary" @click="openCreate">
				<el-icon><EditPen /></el-icon>&nbsp;发动态
			</el-button>
			<div class="spacer" />
			<el-button circle @click="load">
				<el-icon><Refresh /></el-icon>
			</el-button>
		</div>

		<el-timeline v-loading="loading">
			<el-timeline-item
				v-for="d in dynamics"
				:key="d.file"
				:timestamp="`${d.published}${d.location ? ' · ' + d.location : ''}`"
				placement="top"
				:type="d.pinned ? 'danger' : undefined"
			>
				<el-card shadow="never">
					<div class="md-preview dyn-content" v-html="render(d.content)"></div>
					<div class="dyn-actions">
						<el-tag v-if="d.pinned" type="danger" size="small">置顶</el-tag>
						<span class="spacer" />
						<el-button size="small" text type="primary" @click="openEdit(d)">编辑</el-button>
						<el-button size="small" text type="danger" @click="remove(d)">删除</el-button>
					</div>
				</el-card>
			</el-timeline-item>
		</el-timeline>
		<el-empty v-if="!loading && dynamics.length === 0" description="还没有动态" />

		<el-dialog v-model="dialogVisible" :title="editing ? '编辑动态' : '发动态'" width="640px">
			<el-form label-width="70px">
				<el-form-item label="内容" required>
					<el-input v-model="dialogForm.content" type="textarea" :rows="5" placeholder="支持 Markdown 语法，图片用 ![描述](url)" />
				</el-form-item>
				<el-form-item label="时间">
					<el-input v-model="dialogForm.published" placeholder="YYYY-MM-DD HH:mm:ss（留空使用当前时间）" />
				</el-form-item>
				<el-form-item label="位置">
					<el-input v-model="dialogForm.location" placeholder="如：广西（可选）" />
				</el-form-item>
				<el-form-item label="置顶">
					<el-switch v-model="dialogForm.pinned" />
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="dialogVisible = false">取消</el-button>
				<el-button type="primary" :loading="saving" @click="save">保存</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { api, type DynamicItem } from "../api";
import markdownit from "markdown-it";

const md = markdownit({ html: true, linkify: true, breaks: true });
const render = (s: string) => md.render(s || "");

const dynamics = ref<DynamicItem[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const editing = ref<DynamicItem | null>(null);
const dialogForm = ref({ content: "", published: "", location: "", pinned: false });

onMounted(load);

async function load() {
	loading.value = true;
	try {
		dynamics.value = (await api.dynamics.list()).dynamics;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

function openCreate() {
	editing.value = null;
	dialogForm.value = { content: "", published: "", location: "", pinned: false };
	dialogVisible.value = true;
}

function openEdit(d: DynamicItem) {
	editing.value = d;
	dialogForm.value = { content: d.content, published: d.published, location: d.location, pinned: d.pinned };
	dialogVisible.value = true;
}

async function save() {
	if (!dialogForm.value.content.trim()) {
		ElMessage.warning("内容不能为空");
		return;
	}
	saving.value = true;
	try {
		if (editing.value) {
			await api.dynamics.update(editing.value.file, { ...dialogForm.value });
			ElMessage.success("已保存");
		} else {
			await api.dynamics.create({ ...dialogForm.value });
			ElMessage.success("已发布");
		}
		dialogVisible.value = false;
		await load();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		saving.value = false;
	}
}

async function remove(d: DynamicItem) {
	await ElMessageBox.confirm(`确定删除这条动态（${d.published}）？`, "删除确认", { type: "warning" });
	try {
		await api.dynamics.remove(d.file);
		ElMessage.success("已删除");
		await load();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}
</script>

<style scoped>
.dyn-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 8px;
}

.dyn-actions .spacer {
	flex: 1;
}

.dyn-content :deep(p) {
	margin: 0 0 8px;
}

.dyn-content :deep(p:last-child) {
	margin-bottom: 0;
}
</style>
