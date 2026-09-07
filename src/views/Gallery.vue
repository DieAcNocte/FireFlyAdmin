<template>
	<div :class="isMobile ? 'hub' : 'gallery-layout'">
		<!-- 左：相册列表 -->
		<div :class="isMobile ? '' : 'album-col'">
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
					@click="isMobile ? openAlbum(i) : selectAlbum(i)"
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

		<!-- 右：相册图片（电脑端双栏；手机端点击相册卡进入独立页 /gallery/open） -->
		<div v-if="!isMobile" class="image-col">
			<AlbumImages
				v-if="currentAlbum"
				:key="String(currentAlbum.id)"
				:album-id="String(currentAlbum.id)"
				:album-name="String(currentAlbum.name || currentAlbum.id)"
				@loaded="selectedImages = $event"
			/>
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
import { Plus } from "@element-plus/icons-vue";
import { useRouter } from "vue-router";
import { api, type GalleryImage } from "../api";
import { apiUrl, isGithubMode, isMobile } from "../api/base";
import AlbumImages from "../components/AlbumImages.vue";

const router = useRouter();

type Album = Record<string, unknown>;

const albums = ref<Album[]>([]);
const columnWidth = ref(240);
const galleryTheme = ref<string>("firefly");
const loading = ref(false);
const saving = ref(false);
const selectedIndex = ref(-1);
const selectedImages = ref<GalleryImage[]>([]);
/** 直连模式：相册封面缩略图（albumId → blob/外链 URL），打开页面即拉取 */
const covers = ref<Record<string, string>>({});
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

onMounted(load);

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
	// 直连模式：拉取各相册封面缩略图与照片数（不阻塞列表展示，失败按无图处理）
	if (isGithubMode() && albums.value.length) {
		try {
			const r = await api.gallery.covers(albums.value);
			covers.value = r.covers ?? {};
			for (const a of albums.value) {
				const count = (r.counts ?? {})[String(a.id ?? "")];
				if (count !== undefined) a.photoCount = count;
			}
		} catch {
			/* 封面拉取失败不阻塞列表 */
		}
	}
}

function openAlbum(i: number) {
	const a = albums.value[i];
	router.push({ path: "/gallery/open", query: { albumId: String(a.id ?? ""), name: String(a.name || a.id) } });
}

async function selectAlbum(i: number) {
	selectedIndex.value = i;
}

function isCover(name: string): boolean {
	return /^cover\./i.test(name);
}

function coverOf(a: Album): string | undefined {
	const id = String(a.id ?? "");
	if (!id) return undefined;
	// 直连模式：封面缩略图已按相册批量拉取
	if (isGithubMode()) return covers.value[id] || undefined;
	// 电脑端模式：懒加载的封面，仅显示当前选中相册的封面（其图片由 AlbumImages 加载）
	if (selectedIndex.value >= 0 && albums.value[selectedIndex.value] === a) {
		const cover = selectedImages.value.find((img) => isCover(img.name)) ?? selectedImages.value[0];
		return cover ? apiUrl(cover.url) : undefined;
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
		selectedImages.value = [];
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
			selectedImages.value = [];
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
		selectedImages.value = [];
		await load();
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
.hub {
	width: 100%;
}

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

.form-tip {
	color: #909399;
	font-size: 12px;
	line-height: 1.4;
}

.mz-tip {
	margin-top: 12px;
}
</style>
