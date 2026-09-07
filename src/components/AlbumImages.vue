<template>
	<div v-loading="loading">
		<div class="toolbar">
			<span class="col-title">图片：{{ albumName || albumId }}</span>
			<div class="spacer" />
			<el-checkbox v-if="!isGithubMode()" v-model="convertAvif">转 AVIF</el-checkbox>
			<el-button size="small" @click="pickImages">上传图片</el-button>
			<el-button size="small" circle @click="loadImages">
				<el-icon><Refresh /></el-icon>
			</el-button>
		</div>
		<el-empty v-if="images.length === 0" description="相册还没有图片，点击「上传图片」" :image-size="80" />
		<div class="image-grid">
			<div v-for="(img, i) in images" :key="(img.remote ? 'r:' : '') + img.name" class="image-cell">
				<el-image :src="apiUrl(img.url)" fit="cover" class="image-thumb" :preview-src-list="[apiUrl(img.url)]" preview-teleported />
				<div class="image-name" :title="img.remote ? img.url : img.name">
					{{ img.name }}
					<el-tag v-if="img.remote" type="info" size="small">外链</el-tag>
					<el-tag v-if="isCover(img.name)" type="success" size="small">封面</el-tag>
				</div>
				<div class="image-actions">
					<template v-if="!img.remote">
						<el-button size="small" text type="primary" :disabled="isCover(img.name)" @click="makeCover(img.name)">设为封面</el-button>
						<el-button size="small" text type="danger" @click="removeImage(img.name)">删除</el-button>
					</template>
					<span v-else class="remote-tip">来自 urls.txt</span>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Refresh } from "@element-plus/icons-vue";
import { api, uploadImages, type GalleryImage } from "../api";
import { apiUrl, isGithubMode } from "../api/base";

const props = defineProps<{ albumId: string; albumName?: string }>();
const emit = defineEmits<{ (e: "loaded", images: GalleryImage[]): void }>();

const images = ref<GalleryImage[]>([]);
const loading = ref(false);
const saving = ref(false);
const convertAvif = ref(true);

onMounted(() => {
	loadImages();
	// 上传「转 AVIF」默认值跟随应用设置（仅电脑端模式；直连模式无 app 模块，
	// 且此处抛错会打断 Vue post-flush 队列导致页面响应式更新失效）
	if (!isGithubMode()) {
		api.app
			.prefs()
			.then((p) => (convertAvif.value = p.uploadConvertAvif))
			.catch(() => {});
	}
});

async function loadImages() {
	loading.value = true;
	try {
		images.value = (await api.gallery.images(props.albumId)).images;
		emit("loaded", images.value);
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

function isCover(name: string): boolean {
	return /^cover\./i.test(name);
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
			const { saved } = await uploadImages("gallery", files, props.albumId, convertAvif.value);
			ElMessage.success(`已上传 ${saved.length} 张图片`);
			await loadImages();
		} catch (e) {
			ElMessage.error(e instanceof Error ? e.message : String(e));
		}
	};
	input.click();
}

async function makeCover(name: string) {
	try {
		await api.gallery.setCover(props.albumId, name);
		ElMessage.success("已设为封面");
		await loadImages();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}

async function removeImage(name: string) {
	await ElMessageBox.confirm(`确定删除图片 ${name}？`, "删除确认", { type: "warning" });
	try {
		await api.images.remove("gallery", name, props.albumId);
		await loadImages();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}
</script>

<style scoped>
.col-title {
	font-weight: 600;
}

.image-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	gap: 12px;
}

.image-cell {
	background: #fff;
	border: 1px solid #e4e7ed;
	border-radius: 6px;
	overflow: hidden;
}

.image-thumb {
	width: 100%;
	height: 110px;
	display: block;
}

.image-name {
	font-size: 12px;
	padding: 6px 8px 0;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.image-actions {
	display: flex;
	justify-content: space-between;
	padding: 2px 4px 4px;
}

.remote-tip {
	color: #909399;
	font-size: 12px;
	margin: auto;
}
</style>
