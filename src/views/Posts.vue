<template>
	<div>
		<div class="toolbar">
			<el-input v-model="keyword" placeholder="搜索标题/分类/标签" clearable style="width: 260px" />
			<div class="spacer" />
			<el-button type="primary" @click="router.push('/posts/edit')">
				<el-icon><Plus /></el-icon>&nbsp;新建文章
			</el-button>
		</div>
		<el-table :data="filtered" v-loading="loading" stripe>
			<el-table-column label="标题" min-width="240">
				<template #default="{ row }">
					<el-link type="primary" @click="edit(row.file)">{{ row.title }}</el-link>
					<el-tag v-if="row.pinned" type="danger" size="small" style="margin-left: 6px">置顶</el-tag>
					<el-tag v-if="row.draft" type="warning" size="small" style="margin-left: 6px">草稿</el-tag>
					<el-tag v-if="row.hasPassword" type="info" size="small" style="margin-left: 6px">加密</el-tag>
				</template>
			</el-table-column>
			<el-table-column prop="published" label="发布日期" width="120" sortable />
			<el-table-column prop="category" label="分类" width="140" />
			<el-table-column label="标签" min-width="180">
				<template #default="{ row }">
					<el-tag v-for="t in row.tags" :key="t" size="small" effect="plain" style="margin-right: 4px">{{ t }}</el-tag>
				</template>
			</el-table-column>
			<el-table-column prop="slug" label="slug" width="160" show-overflow-tooltip />
			<el-table-column label="操作" width="140" fixed="right">
				<template #default="{ row }">
					<el-button size="small" @click="edit(row.file)">编辑</el-button>
					<el-button size="small" type="danger" plain @click="remove(row)">删除</el-button>
				</template>
			</el-table-column>
		</el-table>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { api, type PostSummary } from "../api";

const router = useRouter();
const posts = ref<PostSummary[]>([]);
const loading = ref(false);
const keyword = ref("");

const filtered = computed(() => {
	const kw = keyword.value.trim().toLowerCase();
	if (!kw) return posts.value;
	return posts.value.filter(
		(p) =>
			p.title.toLowerCase().includes(kw) ||
			p.category.toLowerCase().includes(kw) ||
			p.tags.some((t) => t.toLowerCase().includes(kw))
	);
});

onMounted(load);

async function load() {
	loading.value = true;
	try {
		posts.value = (await api.posts.list()).posts;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

function edit(file: string) {
	router.push({ path: "/posts/edit", query: { file } });
}

async function remove(post: PostSummary) {
	await ElMessageBox.confirm(`确定删除文章「${post.title}」？删除后可通过 git 找回。`, "删除确认", { type: "warning" });
	try {
		await api.posts.remove(post.file);
		ElMessage.success("已删除");
		await load();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}
</script>
