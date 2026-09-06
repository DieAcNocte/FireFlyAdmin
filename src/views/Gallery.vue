<template>
	<div class="gallery-layout">
		<!-- 左：相册列表 -->
		<div class="album-col">
			<div class="toolbar">
				<span class="col-title">相册</span>
				<div class="spacer" />
				<el-button v-if="gallerySupported" size="small" type="primary" @click="openCreate">
					<el-icon><Plus /></el-icon>&nbsp;新建
				</el-button>
			</div>
			<el-alert
				v-if="!gallerySupported && galleryTheme === 'fuwari'"
				type="info"
				:closable="false"
				title="Fuwari 原型主题没有相册功能"
				style="margin-bottom: 12px"
			/>
			<div v-loading="loading">
				<el-card
					v-for="(a, i) in albums"
					:key="String(a.id)"
					shadow="never"
					class="album-card"
					:class="{ active: selectedIndex === i }"
					@click="selectAlbum(i)"
				>
					<div class="album-row">
						<el-image v-if="coverOf(a)" :src="coverOf(a)" fit="cover" class="album-cover" />
						<div v-else class="album-cover album-cover-empty">无图</div>
						<div class="album-meta">
							<div class="album-name">
								{{ a.name || a.id }}
								<el-tag v-if="a.password" type="warning" size="small">加密</el-tag>
							</div>
							<div class="album-sub">{{ a.id }} · {{ a.date || "未设置日期" }}<template v-if="a.photoCount !== undefined"> · {{ a.photoCount }} 张</template></div>
							<div class="album-sub">{{ a.location || "—" }}</div>
							<div class="album-tags">
								<el-tag v-for="t in (a.tags as string[]) || []" :key="t" size="small" effect="plain">{{ t }}</el-tag>
							</div>
						</div>
					</div>
					<div class="album-actions">
						<el-button size="small" text type="primary" @click.stop="openEdit(i)">编辑</el-button>
						<el-button size="small" text type="danger" @click.stop="removeAlbum(i)">删除</el-button>
					</div>
				</el-card>
				<el-empty v-if="!loading && albums.length === 0" description="还没有相册，点击「新建」创建" :image-size="60" />
			</div>
			<template v-if="galleryTheme !== 'scanner'">
				<el-divider>瀑布流列宽</el-divider>
				<el-input-number v-model="columnWidth" :min="120" :max="600" style="width: 100%" />
			</template>
			<el-alert v-else type="info" :closable="false" title="Mizuki 相册以目录存储：public/images/albums/<id>/（info.json + 图片）" class="mz-tip" />
		</div>

		<!-- 右：相册图片 -->
		<div class="image-col">
			<template v-if="currentAlbum">
				<div class="toolbar">
					<span class="col-title">图片：{{ currentAlbum.name || currentAlbum.id }}</span>
					<div class="spacer" />
					<el-checkbox v-model="convertAvif">转 AVIF</el-checkbox>
					<el-button size="small" @click="pickImages">上传图片</el-button>
					<el-button size="small" circle @click="loadImages">
						<el-icon><Refresh /></el-icon>
					</el-button>
				</div>
				<el-empty v-if="images.length === 0" description="相册还没有图片，点击「上传图片」" :image-size="80" />
				<div class="image-grid">
					<div v-for="img in images" :key="img.name" class="image-cell">
						<el-image :src="img.url" fit="cover" class="image-thumb" :preview-src-list="[img.url]" preview-teleported />
						<div class="image-name" :title="img.name">
							{{ img.name }}
							<el-tag v-if="isCover(img.name)" type="success" size="small">封面</el-tag>
						</div>
						<div class="image-actions">
							<el-button size="small" text type="primary" :disabled="isCover(img.name)" @click="makeCover(img.name)">设为封面</el-button>
							<el-button size="small" text type="danger" @click="removeImage(img.name)">删除</el-button>
						</div>
					</div>
				</div>
			</template>
			<el-empty v-else description="在左侧选择一个相册以管理图片" />
		</div>

		<!-- 新建/编辑相册 -->
		<el-dialog v-model="dialogVisible" :title="editIndex === null ? '新建相册' : '编辑相册'" width="560px">
			<el-form label-width="80px">
				<el-form-item label="名称" required>
					<el-input v-model="dialogForm.name" placeholder="如：手机壁纸" @input="suggestId" />
				</el-form-item>
				<el-form-item label="ID" required>
					<el-input v-model="dialogForm.id" :disabled="editIndex !== null" :placeholder="galleryTheme === 'scanner' ? '对应 public/images/albums/<id>/ 目录' : '对应 public/gallery/<id>/ 目录'" />
					<div class="form-tip">图片目录名，只允许字母/数字/-/_；创建后建议不要改动</div>
				</el-form-item>
				<el-form-item label="描述">
					<el-input v-model="dialogForm.description" type="textarea" :rows="2" />
				</el-form-item>
				<el-row :gutter="12">
					<el-col :span="12">
						<el-form-item label="地点">
							<el-input v-model="dialogForm.location" />
						</el-form-item>
					</el-col>
					<el-col :span="12">
						<el-form-item label="日期">
							<el-date-picker v-model="dialogForm.date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
						</el-form-item>
					</el-col>
				</el-row>
				<el-form-item label="标签">
					<el-select v-model="dialogForm.tags" multiple filterable allow-create default-first-option placeholder="回车创建" style="width: 100%" />
				</el-form-item>
				<el-row :gutter="12">
					<el-col :span="12">
						<el-form-item label="访问密码">
							<el-input v-model="dialogForm.password" placeholder="留空表示公开" />
						</el-form-item>
					</el-col>
					<el-col :span="12">
						<el-form-item label="密码提示">
							<el-input v-model="dialogForm.passwordHint" />
						</el-form-item>
					</el-col>
				</el-row>
			</el-form>
			<template #footer>
				<el-button @click="dialogVisible = false">取消</el-button>
				<el-button type="primary" :loading="saving" @click="saveAlbums">保存</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { api, uploadImages, type GalleryImage } from "../api";

type Album = Record<string, unknown>;

const albums = ref<Album[]>([]);
const columnWidth = ref(240);
const galleryTheme = ref<string>("firefly");
const loading = ref(false);
const saving = ref(false);
const selectedIndex = ref(-1);
const images = ref<GalleryImage[]>([]);
const convertAvif = ref(true);
const dialogVisible = ref(false);
const editIndex = ref<number | null>(null);
const dialogForm = ref({
	id: "",
	name: "",
	description: "",
	location: "",
	date: "",
	tags: [] as string[],
	password: "",
	passwordHint: "",
});

const currentAlbum = computed(() => (selectedIndex.value >= 0 ? albums.value[selectedIndex.value] : null));
/** 只有 FireFly / Mizuki 提供相册能力 */
const gallerySupported = computed(() => galleryTheme.value === "firefly" || galleryTheme.value === "mizuki");

onMounted(() => {
	load();
	// 上传「转 AVIF」默认值跟随应用设置
	api.app
		.prefs()
		.then((p) => (convertAvif.value = p.uploadConvertAvif))
		.catch(() => {});
});

async function load() {
	loading.value = true;
	try {
		const res = await api.gallery.get();
		galleryTheme.value = res.theme;
		albums.value = res.albums;
		columnWidth.value = res.columnWidth ?? 240;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

async function selectAlbum(i: number) {
	selectedIndex.value = i;
	await loadImages();
}

async function loadImages() {
	if (!currentAlbum.value) return;
	try {
		images.value = (await api.gallery.images(String(currentAlbum.value.id))).images;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}

function isCover(name: string): boolean {
	return /^cover\./i.test(name);
}

function coverOf(a: Album): string | undefined {
	const id = String(a.id ?? "");
	if (!id) return undefined;
	// 懒加载的封面：优先从已加载图片里找，否则 undefined 不展示
	if (selectedIndex.value >= 0 && albums.value[selectedIndex.value] === a) {
		const cover = images.value.find((img) => isCover(img.name)) ?? images.value[0];
		return cover?.url;
	}
	return undefined;
}

function openCreate() {
	editIndex.value = null;
	dialogForm.value = { id: "", name: "", description: "", location: "", date: today(), tags: [], password: "", passwordHint: "" };
	dialogVisible.value = true;
}

function openEdit(i: number) {
	editIndex.value = i;
	const a = albums.value[i];
	dialogForm.value = {
		id: String(a.id ?? ""),
		name: String(a.name ?? ""),
		description: String(a.description ?? ""),
		location: String(a.location ?? ""),
		date: String(a.date ?? ""),
		tags: Array.isArray(a.tags) ? (a.tags as string[]) : [],
		password: String(a.password ?? ""),
		passwordHint: String(a.passwordHint ?? ""),
	};
	dialogVisible.value = true;
}

function suggestId() {
	if (editIndex.value !== null || dialogForm.value.id) return;
	const id = dialogForm.value.name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	if (id) dialogForm.value.id = id;
}

async function saveAlbums() {
	if (!dialogForm.value.id.trim() || !dialogForm.value.name.trim()) {
		ElMessage.warning("请填写名称与 ID");
		return;
	}
	saving.value = true;
	try {
		if (editIndex.value === null) {
			albums.value.push({ ...dialogForm.value, tags: [...dialogForm.value.tags] });
		} else {
			const target = albums.value[editIndex.value];
			Object.assign(target, dialogForm.value, { tags: [...dialogForm.value.tags] });
		}
		await api.gallery.save(albums.value, galleryTheme.value === "scanner" ? null : columnWidth.value);
		ElMessage.success("相册已保存");
		dialogVisible.value = false;
		selectedIndex.value = -1;
		images.value = [];
		await load();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		saving.value = false;
	}
}

async function removeAlbum(i: number) {
	const a = albums.value[i];
	if (galleryTheme.value === "scanner") {
		// Mizuki：目录即相册，删除会连同图片目录一起移除
		await ElMessageBox.confirm(
			`确定删除相册「${a.name || a.id}」？将同时删除 public/images/albums/${a.id}/ 目录（含全部图片与 info.json），不可恢复。`,
			"删除确认",
			{ type: "warning" }
		);
		try {
			await api.gallery.remove(String(a.id));
			ElMessage.success("已删除");
			selectedIndex.value = -1;
			images.value = [];
			await load();
		} catch (e) {
			ElMessage.error(e instanceof Error ? e.message : String(e));
		}
		return;
	}
	await ElMessageBox.confirm(
		`确定删除相册「${a.name || a.id}」？此操作只从配置移除（public/gallery/${a.id}/ 下的图片文件保留，可手动清理）。`,
		"删除确认",
		{ type: "warning" }
	);
	try {
		albums.value.splice(i, 1);
		await api.gallery.save(albums.value, columnWidth.value);
		ElMessage.success("已删除");
		selectedIndex.value = -1;
		images.value = [];
		await load();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}

function pickImages() {
	const input = document.createElement("input");
	input.type = "file";
	input.multiple = true;
	input.accept = "image/*";
	input.onchange = async () => {
		const files = Array.from(input.files || []);
		if (!files.length || !currentAlbum.value) return;
		try {
			const { saved } = await uploadImages("gallery", files, String(currentAlbum.value.id), convertAvif.value);
			ElMessage.success(`已上传 ${saved.length} 张图片`);
			await loadImages();
		} catch (e) {
			ElMessage.error(e instanceof Error ? e.message : String(e));
		}
	};
	input.click();
}

async function makeCover(name: string) {
	if (!currentAlbum.value) return;
	try {
		await api.gallery.setCover(String(currentAlbum.value.id), name);
		ElMessage.success("已设为封面");
		await loadImages();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}

async function removeImage(name: string) {
	if (!currentAlbum.value) return;
	await ElMessageBox.confirm(`确定删除图片 ${name}？`, "删除确认", { type: "warning" });
	try {
		await api.images.remove("gallery", name, String(currentAlbum.value.id));
		await loadImages();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}

function today(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
</script>

<style scoped>
.gallery-layout {
	display: flex;
	gap: 16px;
	align-items: flex-start;
}

.album-col {
	width: 360px;
	flex-shrink: 0;
}

.image-col {
	flex: 1;
	min-width: 0;
}

.col-title {
	font-weight: 600;
}

.album-card {
	cursor: pointer;
	margin-bottom: 10px;
	border: 1px solid #e4e7ed;
}

.album-card.active {
	border-color: var(--el-color-primary);
}

.album-row {
	display: flex;
	gap: 12px;
}

.album-cover {
	width: 84px;
	height: 84px;
	border-radius: 6px;
	flex-shrink: 0;
}

.album-cover-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	background: #f5f7fa;
	color: #909399;
	font-size: 12px;
}

.album-meta {
	flex: 1;
	min-width: 0;
}

.album-name {
	font-weight: 600;
	display: flex;
	align-items: center;
	gap: 6px;
}

.album-sub {
	color: #909399;
	font-size: 12px;
	margin-top: 2px;
}

.album-tags {
	margin-top: 4px;
	display: flex;
	gap: 4px;
	flex-wrap: wrap;
}

.album-actions {
	margin-top: 6px;
	text-align: right;
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

.form-tip {
	color: #909399;
	font-size: 12px;
	line-height: 1.4;
}

.mz-tip {
	margin-top: 12px;
}
</style>
