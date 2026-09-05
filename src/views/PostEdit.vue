<template>
	<div v-loading="loading">
		<div class="toolbar">
			<el-button @click="router.push('/posts')">← 返回列表</el-button>
			<span class="title-label">{{ isNew ? "新建文章" : `编辑：${form.title || file}` }}</span>
			<div class="spacer" />
			<el-button @click="pickImages">插入图片</el-button>
			<el-button type="primary" :loading="saving" @click="save">保存</el-button>
		</div>

		<el-card shadow="never" class="page-card">
			<el-form label-width="90px">
				<el-row :gutter="16">
					<el-col :span="12">
						<el-form-item label="标题" required>
							<el-input v-model="form.title" placeholder="文章标题" @blur="autoSlug" />
						</el-form-item>
					</el-col>
					<el-col :span="6">
						<el-form-item label="slug">
							<el-input v-model="form.slug" placeholder="URL 标识（留空自动生成）" />
						</el-form-item>
					</el-col>
					<el-col :span="6">
						<el-form-item label="发布日期">
							<el-date-picker v-model="form.published" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
						</el-form-item>
					</el-col>
				</el-row>
				<el-row :gutter="16">
					<el-col :span="8">
						<el-form-item label="分类">
							<el-input v-model="form.category" placeholder="如：前端" />
						</el-form-item>
					</el-col>
					<el-col :span="16">
						<el-form-item label="标签">
							<el-select v-model="form.tags" multiple filterable allow-create default-first-option placeholder="输入后回车创建" style="width: 100%">
								<el-option v-for="t in tagOptions" :key="t" :label="t" :value="t" />
							</el-select>
						</el-form-item>
					</el-col>
				</el-row>
				<el-form-item label="描述">
					<el-input v-model="form.description" type="textarea" :rows="2" placeholder="文章摘要（SEO / 列表展示）" />
				</el-form-item>
				<el-row :gutter="16">
					<el-col :span="8">
						<el-form-item label="封面图">
							<el-input v-model="form.image" placeholder="./cover.jpg 或留空" />
						</el-form-item>
					</el-col>
					<el-col :span="8">
						<el-form-item label="系列">
							<el-input v-model="form.series" placeholder="系列名（可选）" />
						</el-form-item>
					</el-col>
					<el-col :span="8">
						<el-form-item label="系列序号">
							<el-input-number v-model="form.seriesOrder" :min="1" style="width: 100%" placeholder="系列内顺序" />
						</el-form-item>
					</el-col>
				</el-row>
				<el-row :gutter="16">
					<el-col :span="6">
						<el-form-item label="草稿">
							<el-switch v-model="form.draft" />
						</el-form-item>
					</el-col>
					<el-col :span="6">
						<el-form-item label="置顶">
							<el-switch v-model="form.pinned" />
						</el-form-item>
					</el-col>
					<el-col :span="6">
						<el-form-item label="允许评论">
							<el-switch v-model="form.comment" />
						</el-form-item>
					</el-col>
				</el-row>
				<el-collapse>
					<el-collapse-item title="更多选项（语言 / 密码 / 更新时间等）">
						<el-row :gutter="16">
							<el-col :span="8">
								<el-form-item label="语言 lang">
									<el-input v-model="form.lang" placeholder="留空使用站点语言" />
								</el-form-item>
							</el-col>
							<el-col :span="8">
								<el-form-item label="访问密码">
									<el-input v-model="form.password" placeholder="留空表示不加密" />
								</el-form-item>
							</el-col>
							<el-col :span="8">
								<el-form-item label="密码提示">
									<el-input v-model="form.passwordHint" />
								</el-form-item>
							</el-col>
						</el-row>
						<el-row :gutter="16">
							<el-col :span="8">
								<el-form-item label="更新时间">
									<el-date-picker v-model="form.updated" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
								</el-form-item>
							</el-col>
						</el-row>
					</el-collapse-item>
				</el-collapse>
			</el-form>
		</el-card>

		<el-card shadow="never" style="height: calc(100vh - 320px); min-height: 420px">
			<MarkdownEditor ref="editorRef" v-model="body" style="height: 100%" />
		</el-card>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { api, uploadImages } from "../api";
import MarkdownEditor from "../components/MarkdownEditor.vue";

const route = useRoute();
const router = useRouter();
const file = computed(() => String(route.query.file || ""));
const isNew = computed(() => !file.value);

const loading = ref(false);
const saving = ref(false);
const editorRef = ref<InstanceType<typeof MarkdownEditor>>();

const form = ref({
	title: "",
	slug: "",
	published: today(),
	description: "",
	image: "",
	tags: [] as string[],
	category: "",
	draft: false,
	pinned: false,
	comment: true,
	lang: "",
	series: "",
	seriesOrder: undefined as number | undefined,
	password: "",
	passwordHint: "",
	updated: "",
});
const body = ref("");
const tagOptions = ref<string[]>([]);

onMounted(async () => {
	// 拉取已有标签作为可选项
	try {
		const { posts } = await api.posts.list();
		const set = new Set<string>();
		for (const p of posts) p.tags.forEach((t) => set.add(t));
		tagOptions.value = [...set];
	} catch {
		/* ignore */
	}
	if (!isNew.value) await loadPost();
});

async function loadPost() {
	loading.value = true;
	try {
		const detail = await api.posts.detail(file.value);
		const d = detail.data;
		form.value = {
			title: String(d.title ?? ""),
			slug: String(d.slug ?? ""),
			published: toDate(d.published) || today(),
			description: String(d.description ?? ""),
			image: String(d.image ?? ""),
			tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
			category: String(d.category ?? ""),
			draft: Boolean(d.draft),
			pinned: Boolean(d.pinned),
			comment: d.comment !== false,
			lang: String(d.lang ?? ""),
			series: String(d.series ?? ""),
			seriesOrder: typeof d.seriesOrder === "number" ? d.seriesOrder : undefined,
			password: String(d.password ?? ""),
			passwordHint: String(d.passwordHint ?? ""),
			updated: toDate(d.updated ?? ""),
		};
		body.value = detail.body;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

function toDate(v: unknown): string {
	if (typeof v !== "string" || !v) return "";
	const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
	return m ? m[1] : "";
}

function today(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function autoSlug() {
	if (!isNew.value) return; // 编辑时 slug 已固定，避免误改
	form.value.slug = ""; // 留空由后端根据标题自动生成
}

function pickImages() {
	const input = document.createElement("input");
	input.type = "file";
	input.multiple = true;
	input.accept = "image/*";
	input.onchange = async () => {
		const files = Array.from(input.files || []);
		if (!files.length) return;
		try {
			const { saved } = await uploadImages("post-images", files);
			for (const name of saved) {
				editorRef.value?.insertSnippet(`![${name.replace(/\.[^.]+$/, "")}](./images/${name})\n`);
			}
			ElMessage.success(`已上传 ${saved.length} 张图片并插入`);
		} catch (e) {
			ElMessage.error(e instanceof Error ? e.message : String(e));
		}
	};
	input.click();
}

async function save() {
	if (!form.value.title.trim()) {
		ElMessage.warning("请填写标题");
		return;
	}
	saving.value = true;
	try {
		const payload: Record<string, unknown> = {
			title: form.value.title.trim(),
			slug: form.value.slug.trim() || undefined,
			published: form.value.published,
			description: form.value.description,
			image: form.value.image,
			tags: form.value.tags,
			category: form.value.category,
			draft: form.value.draft,
			pinned: form.value.pinned,
			comment: form.value.comment,
			lang: form.value.lang,
			series: form.value.series,
			seriesOrder: form.value.seriesOrder,
			password: form.value.password,
			passwordHint: form.value.passwordHint,
			updated: form.value.updated || undefined,
			body: body.value,
		};
		let resultFile: string;
		if (isNew.value) {
			resultFile = (await api.posts.create(payload)).file;
			ElMessage.success("文章已创建");
		} else {
			resultFile = (await api.posts.update(file.value, payload)).file;
			ElMessage.success("已保存");
		}
		if (route.query.file !== resultFile) {
			router.replace({ path: "/posts/edit", query: { file: resultFile } });
		}
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		saving.value = false;
	}
}
</script>

<style scoped>
.title-label {
	color: #303133;
	font-weight: 600;
}
</style>
