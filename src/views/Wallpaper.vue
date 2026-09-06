<template>
	<div v-loading="loading">
		<el-card shadow="never" class="page-card">
			<template #header>壁纸模式</template>
			<el-radio-group v-model="v.mode">
				<el-radio-button value="banner">横幅壁纸</el-radio-button>
				<el-radio-button value="fullscreen">全屏壁纸</el-radio-button>
				<el-radio-button value="overlay">透明覆盖</el-radio-button>
				<el-radio-button value="none">纯色背景</el-radio-button>
			</el-radio-group>
		</el-card>

		<el-card shadow="never" class="page-card">
			<template #header>
				<div class="card-header">
					<span>桌面壁纸（每次刷新随机显示一张）</span>
					<el-button size="small" @click="openPicker('desktop')">添加图片</el-button>
				</div>
			</template>
			<el-empty v-if="v.desktop.length === 0" description="还没有桌面壁纸，点击「添加图片」从图库选择或上传" :image-size="60" />
			<transition-group name="list" tag="div" class="wall-list">
				<div v-for="(item, i) in v.desktop" :key="item" class="wall-item">
					<el-image :src="wallPreview(item, 'desktop')" fit="cover" class="wall-thumb">
						<template #error>
							<div class="wall-thumb-err">外部图</div>
						</template>
					</el-image>
					<div class="wall-path" :title="item">{{ item }}</div>
					<div class="wall-actions">
						<el-button size="small" text :disabled="i === 0" @click="move(v.desktop, i, -1)">↑</el-button>
						<el-button size="small" text :disabled="i === v.desktop.length - 1" @click="move(v.desktop, i, 1)">↓</el-button>
						<el-button size="small" text type="danger" @click="v.desktop.splice(i, 1)">移除</el-button>
					</div>
				</div>
			</transition-group>
		</el-card>

		<el-card shadow="never" class="page-card">
			<template #header>
				<div class="card-header">
					<span>移动壁纸</span>
					<el-button size="small" @click="openPicker('mobile')">添加图片</el-button>
				</div>
			</template>
			<el-empty v-if="v.mobile.length === 0" description="还没有移动壁纸" :image-size="60" />
			<transition-group name="list" tag="div" class="wall-list">
				<div v-for="(item, i) in v.mobile" :key="item" class="wall-item">
					<el-image :src="wallPreview(item, 'mobile')" fit="cover" class="wall-thumb">
						<template #error>
							<div class="wall-thumb-err">外部图</div>
						</template>
					</el-image>
					<div class="wall-path" :title="item">{{ item }}</div>
					<div class="wall-actions">
						<el-button size="small" text :disabled="i === 0" @click="move(v.mobile, i, -1)">↑</el-button>
						<el-button size="small" text :disabled="i === v.mobile.length - 1" @click="move(v.mobile, i, 1)">↓</el-button>
						<el-button size="small" text type="danger" @click="v.mobile.splice(i, 1)">移除</el-button>
					</div>
				</div>
			</transition-group>
		</el-card>

		<el-card shadow="never" class="page-card">
			<template #header>主页横幅文字</template>
			<el-form label-width="120px">
				<el-form-item label="启用横幅文字">
					<el-switch v-model="v.homeEnable" />
				</el-form-item>
				<el-form-item label="主标题">
					<el-input v-model="v.homeTitle" />
				</el-form-item>
				<el-form-item label="副标题">
					<div class="subtitle-list">
						<div v-for="(s, i) in v.homeSubtitle" :key="i" class="subtitle-row">
							<el-input v-model="v.homeSubtitle[i]" />
							<el-button text type="danger" @click="v.homeSubtitle.splice(i, 1)">删除</el-button>
						</div>
						<el-button size="small" @click="v.homeSubtitle.push('')">+ 添加一行</el-button>
					</div>
				</el-form-item>
				<el-form-item label="显示链接图标">
					<el-switch v-model="v.linksEnable" />
				</el-form-item>
				<el-form-item label="横幅链接">
					<el-table :data="v.links" size="small" border>
						<el-table-column label="名称" width="140">
							<template #default="{ row }"><el-input v-model="row.name" size="small" /></template>
						</el-table-column>
						<el-table-column label="图标 (Iconify)" width="220">
							<template #default="{ row }"><el-input v-model="row.icon" size="small" placeholder="fa7-brands:github" /></template>
						</el-table-column>
						<el-table-column label="链接">
							<template #default="{ row }"><el-input v-model="row.url" size="small" /></template>
						</el-table-column>
						<el-table-column label="显示名称" width="100">
							<template #default="{ row }"><el-switch v-model="row.showName" size="small" /></template>
						</el-table-column>
						<el-table-column label="" width="60">
							<template #default="{ $index }">
								<el-button size="small" text type="danger" @click="v.links.splice($index, 1)">删</el-button>
							</template>
						</el-table-column>
					</el-table>
					<el-button size="small" style="margin-top: 8px" @click="addLink">+ 添加链接</el-button>
				</el-form-item>
			</el-form>
		</el-card>

		<div class="save-bar">
			<el-button type="primary" size="large" :loading="saving" @click="saveAll">保存全部修改</el-button>
			<span class="save-tip">保存后建议重启博客 dev server 使配置生效</span>
		</div>

		<!-- 图片选择器 -->
		<el-dialog v-model="pickerVisible" :title="pickerKind === 'desktop' ? '选择桌面壁纸' : '选择移动壁纸'" width="720px">
			<div class="picker-toolbar">
				<el-button size="small" @click="uploadForPicker">上传新图片</el-button>
				<el-checkbox v-model="convertAvif" size="small">上传时转 AVIF</el-checkbox>
				<el-button size="small" circle @click="refreshPicker">
					<el-icon><Refresh /></el-icon>
				</el-button>
			</div>
			<div v-loading="pickerLoading" class="picker-grid">
				<div
					v-for="img in pickerImages"
					:key="img.name"
					class="picker-cell"
					:class="{ selected: pickerSelected.has(img.name) }"
					@click="togglePick(img.name)"
				>
					<el-image :src="img.url" fit="cover" class="picker-thumb" />
					<div class="picker-name">{{ img.name }}</div>
					<el-icon v-if="pickerSelected.has(img.name)" class="picker-check"><CircleCheckFilled /></el-icon>
				</div>
			</div>
			<div class="picker-manual">
				<el-input v-model="manualPath" placeholder="手动添加路径或远程 URL，如 assets/images/DesktopWallpaper/my.avif" />
				<el-button @click="addManual">添加</el-button>
			</div>
			<template #footer>
				<el-button @click="pickerVisible = false">取消</el-button>
				<el-button type="primary" @click="confirmPicker">加入列表</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { api, uploadImages, type ImageInfo } from "../api";

const loading = ref(false);
const saving = ref(false);

const v = ref({
	mode: "fullscreen",
	desktop: [] as string[],
	mobile: [] as string[],
	homeEnable: true,
	homeTitle: "",
	homeSubtitle: [] as string[],
	linksEnable: true,
	links: [] as { name: string; icon: string; url: string; showName?: boolean }[],
});

const pickerVisible = ref(false);
const pickerKind = ref<"desktop" | "mobile">("desktop");
const pickerImages = ref<ImageInfo[]>([]);
const pickerLoading = ref(false);
const pickerSelected = ref(new Set<string>());
const manualPath = ref("");
const convertAvif = ref(true);

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
		const res = await api.configs.get("backgroundWallpaper.ts");
		const val = (path: string) => res.fields.find((f) => f.path === path)?.value;
		v.value.mode = String(val("mode") ?? "fullscreen");
		v.value.desktop = Array.isArray(val("src.desktop")) ? (val("src.desktop") as string[]) : [];
		v.value.mobile = Array.isArray(val("src.mobile")) ? (val("src.mobile") as string[]) : [];
		v.value.homeEnable = Boolean(val("common.homeText.enable"));
		v.value.homeTitle = String(val("common.homeText.title") ?? "");
		v.value.homeSubtitle = Array.isArray(val("common.homeText.subtitle")) ? [...(val("common.homeText.subtitle") as string[])] : [];
		v.value.linksEnable = Boolean(val("common.homeText.linksEnable"));
		const links = val("common.homeText.links");
		v.value.links = Array.isArray(links)
			? (links as Record<string, unknown>[]).map((l) => ({
					name: String(l.name ?? ""),
					icon: String(l.icon ?? ""),
					url: String(l.url ?? ""),
					showName: l.showName === true ? true : undefined,
				}))
			: [];
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

function wallPreview(item: string, kind: "desktop" | "mobile"): string | undefined {
	if (/^https?:\/\//.test(item)) return item;
	if (item.startsWith("/")) {
		return `/api/media?root=${kind}&f=${encodeURIComponent(item.replace(/^\/+/, ""))}`;
	}
	const rel = item.replace(/^assets\/images\/(DesktopWallpaper|MobileWallpaper)\//, "");
	return `/api/media?root=${kind}&f=${encodeURIComponent(rel)}`;
}

function move(arr: string[], i: number, dir: -1 | 1) {
	const j = i + dir;
	if (j < 0 || j >= arr.length) return;
	[arr[i], arr[j]] = [arr[j], arr[i]];
}

function addLink() {
	v.value.links.push({ name: "", icon: "", url: "" });
}

async function openPicker(kind: "desktop" | "mobile") {
	pickerKind.value = kind;
	pickerSelected.value = new Set();
	manualPath.value = "";
	pickerVisible.value = true;
	await refreshPicker();
}

async function refreshPicker() {
	pickerLoading.value = true;
	try {
		const target = pickerKind.value === "desktop" ? "wallpaper-desktop" : "wallpaper-mobile";
		pickerImages.value = (await api.images.list(target)).images;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		pickerLoading.value = false;
	}
}

function togglePick(name: string) {
	const s = new Set(pickerSelected.value);
	if (s.has(name)) s.delete(name);
	else s.add(name);
	pickerSelected.value = s;
}

function uploadForPicker() {
	const input = document.createElement("input");
	input.type = "file";
	input.multiple = true;
	input.accept = "image/*";
	input.onchange = async () => {
		const files = Array.from(input.files || []);
		if (!files.length) return;
		try {
			const target = pickerKind.value === "desktop" ? "wallpaper-desktop" : "wallpaper-mobile";
			await uploadImages(target, files, undefined, convertAvif.value);
			ElMessage.success("上传成功");
			await refreshPicker();
		} catch (e) {
			ElMessage.error(e instanceof Error ? e.message : String(e));
		}
	};
	input.click();
}

function addManual() {
	const p = manualPath.value.trim();
	if (!p) return;
	const dirPrefix = pickerKind.value === "desktop" ? "DesktopWallpaper" : "MobileWallpaper";
	const value = p.startsWith("/") || /^https?:\/\//.test(p) ? p : `assets/images/${dirPrefix}/${p}`;
	const list = pickerKind.value === "desktop" ? v.value.desktop : v.value.mobile;
	if (!list.includes(value)) list.push(value);
	manualPath.value = "";
	ElMessage.success("已加入列表");
}

function confirmPicker() {
	const kind = pickerKind.value;
	const list = kind === "desktop" ? v.value.desktop : v.value.mobile;
	for (const name of pickerSelected.value) {
		const value = `assets/images/${kind === "desktop" ? "DesktopWallpaper" : "MobileWallpaper"}/${name}`;
		if (!list.includes(value)) list.push(value);
	}
	pickerVisible.value = false;
	ElMessage.success("已加入列表，记得保存");
}

async function saveAll() {
	saving.value = true;
	try {
		const links = v.value.links
			.filter((l) => l.name || l.url)
			.map((l) => {
				const item: Record<string, unknown> = { name: l.name, icon: l.icon, url: l.url };
				if (l.showName) item.showName = true;
				return item;
			});
		await api.configs.saveFields("backgroundWallpaper.ts", [
			{ path: "mode", value: v.value.mode },
			{ path: "src.desktop", value: [...v.value.desktop] },
			{ path: "src.mobile", value: [...v.value.mobile] },
			{ path: "common.homeText.enable", value: v.value.homeEnable },
			{ path: "common.homeText.title", value: v.value.homeTitle },
			{ path: "common.homeText.subtitle", value: [...v.value.homeSubtitle.filter((s) => s.trim())] },
			{ path: "common.homeText.linksEnable", value: v.value.linksEnable },
			{ path: "common.homeText.links", value: links },
		]);
		ElMessage.success("已保存，建议重启博客 dev server");
		await load();
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

.wall-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.wall-item {
	display: flex;
	align-items: center;
	gap: 10px;
	background: #fafafa;
	border: 1px solid #ebeef5;
	border-radius: 6px;
	padding: 6px 10px;
}

.wall-thumb {
	width: 72px;
	height: 44px;
	border-radius: 4px;
	flex-shrink: 0;
}

.wall-thumb-err {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	color: #909399;
	font-size: 12px;
	background: #f5f7fa;
}

.wall-path {
	flex: 1;
	font-size: 13px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.wall-actions {
	flex-shrink: 0;
}

.subtitle-row {
	display: flex;
	gap: 8px;
	margin-bottom: 6px;
}

.subtitle-list {
	width: 100%;
}

.save-bar {
	position: sticky;
	bottom: 12px;
	display: flex;
	align-items: center;
	gap: 12px;
	background: #fff;
	border: 1px solid #e4e7ed;
	border-radius: 8px;
	padding: 10px 16px;
	box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.save-tip {
	color: #909399;
	font-size: 12px;
}

.picker-toolbar {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 12px;
}

.picker-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
	gap: 10px;
	max-height: 420px;
	overflow: auto;
}

.picker-cell {
	position: relative;
	border: 2px solid transparent;
	border-radius: 6px;
	cursor: pointer;
	overflow: hidden;
	background: #f5f7fa;
}

.picker-cell.selected {
	border-color: var(--el-color-primary);
}

.picker-thumb {
	width: 100%;
	height: 90px;
	display: block;
}

.picker-name {
	font-size: 11px;
	padding: 4px 6px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.picker-check {
	position: absolute;
	top: 6px;
	right: 6px;
	color: var(--el-color-primary);
	font-size: 20px;
}

.picker-manual {
	display: flex;
	gap: 8px;
	margin-top: 12px;
}

.list-move {
	transition: transform 0.2s;
}
</style>
