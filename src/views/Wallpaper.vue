<template>
	<div v-loading="loading">
		<!-- 壁纸模式：FireFly 四种 / Mizuki 三种（配置位置也不同） -->
		<el-card v-if="theme === 'firefly'" shadow="never" class="page-card">
			<template #header>壁纸模式</template>
			<el-radio-group v-model="v.mode">
				<el-radio-button value="banner">横幅壁纸</el-radio-button>
				<el-radio-button value="fullscreen">全屏壁纸</el-radio-button>
				<el-radio-button value="overlay">透明覆盖</el-radio-button>
				<el-radio-button value="none">纯色背景</el-radio-button>
			</el-radio-group>
		</el-card>
		<el-card v-else-if="theme === 'mizuki'" shadow="never" class="page-card">
			<template #header>壁纸模式（siteConfig.wallpaperMode）</template>
			<el-radio-group v-model="mz.mode">
				<el-radio-button value="banner">横幅壁纸</el-radio-button>
				<el-radio-button value="fullscreen">全屏壁纸</el-radio-button>
				<el-radio-button value="none">无壁纸</el-radio-button>
			</el-radio-group>
		</el-card>

		<!-- 壁纸图片列表：两种主题的列表交互一致，按分区渲染（Fuwari/未知主题无此模块） -->
		<template v-if="theme === 'firefly' || theme === 'mizuki'">
			<el-card v-for="sec in wallSections" :key="sec.id" shadow="never" class="page-card">
				<template #header>
					<div class="card-header">
						<span>{{ sec.label }}</span>
						<el-button size="small" @click="openPicker(sec.list, sec.kind)">添加图片</el-button>
					</div>
				</template>
				<el-empty v-if="sec.list.length === 0" :description="sec.empty" :image-size="60" />
				<transition-group name="list" tag="div" class="wall-list">
					<div v-for="(item, i) in sec.list" :key="item" class="wall-item">
						<el-image :src="wallPreview(item, sec.kind)" fit="cover" class="wall-thumb">
							<template #error>
								<div class="wall-thumb-err">外部图</div>
							</template>
						</el-image>
						<div class="wall-path" :title="item">{{ item }}</div>
						<div class="wall-actions">
							<el-button size="small" text :disabled="i === 0" @click="move(sec.list, i, -1)">↑</el-button>
							<el-button size="small" text :disabled="i === sec.list.length - 1" @click="move(sec.list, i, 1)">↓</el-button>
							<el-button size="small" text type="danger" @click="sec.list.splice(i, 1)">移除</el-button>
						</div>
					</div>
				</transition-group>
			</el-card>
		</template>

		<!-- Mizuki：全屏壁纸效果参数 -->
		<el-card v-if="theme === 'mizuki'" shadow="never" class="page-card">
			<template #header>全屏壁纸效果（fullscreenWallpaperConfig）</template>
				<el-form label-width="140px" class="mz-form">
					<el-form-item v-if="configLayout !== 'single'" label="启用全屏壁纸">
						<el-switch v-model="mz.enable" />
					</el-form-item>
				<el-form-item label="壁纸定位">
					<el-select v-model="mz.position" style="width: 200px">
						<el-option v-for="o in ['top', 'center', 'bottom']" :key="o" :label="o" :value="o" />
					</el-select>
				</el-form-item>
				<el-form-item label="启用轮播">
					<el-switch v-model="mz.carouselEnable" />
				</el-form-item>
				<el-form-item label="轮播间隔 (秒)">
					<el-input-number v-model="mz.interval" :min="1" :max="60" style="width: 200px" />
				</el-form-item>
				<el-form-item label="不透明度 (0-1)">
					<el-input-number v-model="mz.opacity" :min="0" :max="1" :step="0.05" style="width: 200px" />
				</el-form-item>
				<el-form-item label="模糊半径 (px)">
					<el-input-number v-model="mz.blur" :min="0" :max="20" style="width: 200px" />
				</el-form-item>
			</el-form>
		</el-card>

		<!-- 主页横幅文字 -->
		<el-card v-if="theme === 'firefly' || theme === 'mizuki'" shadow="never" class="page-card">
			<template #header>{{ theme === "mizuki" ? "主页横幅文字（siteConfig.banner.homeText）" : "主页横幅文字" }}</template>
			<el-form label-width="120px">
				<el-form-item label="启用横幅文字">
					<el-switch v-model="home.enable" />
				</el-form-item>
				<el-form-item label="主标题">
					<el-input v-model="home.title" />
				</el-form-item>
				<el-form-item label="副标题">
					<div class="subtitle-list">
						<div v-for="(s, i) in home.subtitle" :key="i" class="subtitle-row">
							<el-input v-model="home.subtitle[i]" />
							<el-button text type="danger" @click="home.subtitle.splice(i, 1)">删除</el-button>
						</div>
						<el-button size="small" @click="home.subtitle.push('')">+ 添加一行</el-button>
					</div>
				</el-form-item>
				<template v-if="theme !== 'mizuki'">
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
				</template>
			</el-form>
		</el-card>

		<el-alert
			v-if="theme === 'fuwari'"
			type="info"
			:closable="false"
			title="Fuwari 原型主题没有独立的壁纸模块：横幅图片在「站点配置 → 站点基础」的 banner 字段中管理"
			class="page-card"
		/>
		<el-alert
			v-else-if="theme === 'unknown'"
			type="warning"
			:closable="false"
			title="当前项目主题无法识别，壁纸管理不可用"
			class="page-card"
		/>

		<div v-if="theme === 'firefly' || theme === 'mizuki'" class="save-bar">
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
				<el-input v-model="manualPath" :placeholder="manualPlaceholder" />
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
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { Refresh, CircleCheckFilled } from "@element-plus/icons-vue";
import { api, uploadImages, type ImageInfo } from "../api";

const theme = ref<"firefly" | "mizuki" | "unknown">("firefly");
/** Mizuki 配置布局：dir = v9+（src/config/）；single = v8.x（src/config.ts，全屏壁纸无 enable 字段） */
const configLayout = ref<"dir" | "single" | null>("dir");
const loading = ref(false);
const saving = ref(false);

// FireFly（backgroundWallpaper.ts 单配置）
const v = ref({
	mode: "fullscreen",
	desktop: [] as string[],
	mobile: [] as string[],
	linksEnable: true,
	links: [] as { name: string; icon: string; url: string; showName?: boolean }[],
});

// Mizuki（siteConfig.ts 的 wallpaperMode/banner + backgroundWallpaper.ts 的 fullscreenWallpaperConfig）
const mz = ref({
	mode: "banner",
	bannerDesktop: [] as string[],
	bannerMobile: [] as string[],
	enable: true,
	position: "center",
	carouselEnable: true,
	interval: 5,
	opacity: 0.8,
	blur: 1,
	fullDesktop: [] as string[],
	fullMobile: [] as string[],
});

// 横幅文字：两种主题字段一致（Mizuki 无链接图标组）
const home = ref({ enable: true, title: "", subtitle: [] as string[] });

interface WallSection {
	id: string;
	label: string;
	kind: "desktop" | "mobile";
	list: string[];
	empty: string;
}

/** 壁纸列表分区：FireFly 一组（随机壁纸），Mizuki 两组（横幅轮播 + 全屏壁纸） */
const wallSections = computed<WallSection[]>(() => {
	if (theme.value === "mizuki") {
		return [
			{ id: "mz-banner-desktop", label: "横幅桌面图（siteConfig.banner.src）", kind: "desktop", list: mz.value.bannerDesktop, empty: "还没有桌面横幅图，点击「添加图片」从图库选择或上传" },
			{ id: "mz-banner-mobile", label: "横幅移动图", kind: "mobile", list: mz.value.bannerMobile, empty: "还没有移动横幅图" },
			{ id: "mz-full-desktop", label: "全屏桌面壁纸（fullscreenWallpaperConfig）", kind: "desktop", list: mz.value.fullDesktop, empty: "还没有桌面壁纸" },
			{ id: "mz-full-mobile", label: "全屏移动壁纸", kind: "mobile", list: mz.value.fullMobile, empty: "还没有移动壁纸" },
		];
	}
	return [
		{ id: "ff-desktop", label: "桌面壁纸（每次刷新随机显示一张）", kind: "desktop", list: v.value.desktop, empty: "还没有桌面壁纸，点击「添加图片」从图库选择或上传" },
		{ id: "ff-mobile", label: "移动壁纸", kind: "mobile", list: v.value.mobile, empty: "还没有移动壁纸" },
	];
});

const pickerVisible = ref(false);
const pickerKind = ref<"desktop" | "mobile">("desktop");
/** 选择器把结果追加进该数组引用 */
const pickerList = ref<string[] | null>(null);
const pickerImages = ref<ImageInfo[]>([]);
const pickerLoading = ref(false);
const pickerSelected = ref(new Set<string>());
const manualPath = ref("");
const convertAvif = ref(true);

const manualPlaceholder = computed(() => {
	if (theme.value === "mizuki") {
		return configLayout.value === "single"
			? "手动添加路径或远程 URL，如 /images/my.webp"
			: "手动添加路径或远程 URL，如 /assets/desktop-banner/my.webp";
	}
	return "手动添加路径或远程 URL，如 assets/images/DesktopWallpaper/my.avif";
});

onMounted(async () => {
	try {
		const caps = await api.theme.get();
		theme.value = caps.theme;
		configLayout.value = caps.configLayout;
	} catch {
		/* 探测失败按 FireFly 处理 */
	}
	if (theme.value === "mizuki") await loadMizuki();
	else if (theme.value === "firefly") await load();
	// 上传「转 AVIF」默认值跟随应用设置
	api.app
		.prefs()
		.then((p) => (convertAvif.value = p.uploadConvertAvif))
		.catch(() => {});
});

function val(fields: { path: string; value: unknown; readError?: string | null }[], path: string) {
	return fields.find((f) => f.path === path)?.value;
}

function asStrings(value: unknown): string[] {
	return Array.isArray(value) ? value.map(String) : [];
}

async function load() {
	loading.value = true;
	try {
		const res = await api.configs.get("backgroundWallpaper.ts");
		v.value.mode = String(val(res.fields, "mode") ?? "fullscreen");
		v.value.desktop = asStrings(val(res.fields, "src.desktop"));
		v.value.mobile = asStrings(val(res.fields, "src.mobile"));
		home.value.enable = Boolean(val(res.fields, "common.homeText.enable"));
		home.value.title = String(val(res.fields, "common.homeText.title") ?? "");
		home.value.subtitle = asStrings(val(res.fields, "common.homeText.subtitle"));
		v.value.linksEnable = Boolean(val(res.fields, "common.homeText.linksEnable"));
		const links = val(res.fields, "common.homeText.links");
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

async function loadMizuki() {
	loading.value = true;
	try {
		const [site, wall] = await Promise.all([api.configs.get("siteConfig.ts"), api.configs.get("backgroundWallpaper.ts")]);
		mz.value.mode = String(val(site.fields, "wallpaperMode.defaultMode") ?? "banner");
		mz.value.bannerDesktop = asStrings(val(site.fields, "banner.src.desktop"));
		mz.value.bannerMobile = asStrings(val(site.fields, "banner.src.mobile"));
		home.value.enable = Boolean(val(site.fields, "banner.homeText.enable"));
		home.value.title = String(val(site.fields, "banner.homeText.title") ?? "");
		home.value.subtitle = asStrings(val(site.fields, "banner.homeText.subtitle"));
		mz.value.enable = Boolean(val(wall.fields, "enable"));
		mz.value.position = String(val(wall.fields, "position") ?? "center");
		mz.value.carouselEnable = Boolean(val(wall.fields, "carousel.enable"));
		mz.value.interval = Number(val(wall.fields, "carousel.interval") ?? 5);
		mz.value.opacity = Number(val(wall.fields, "opacity") ?? 0.8);
		mz.value.blur = Number(val(wall.fields, "blur") ?? 1);
		mz.value.fullDesktop = asStrings(val(wall.fields, "src.desktop"));
		mz.value.fullMobile = asStrings(val(wall.fields, "src.mobile"));
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

/** 壁纸缩略图预览 URL（路径约定随主题与布局不同） */
function wallPreview(item: string, kind: "desktop" | "mobile"): string | undefined {
	if (/^https?:\/\//.test(item)) return item;
	if (theme.value === "mizuki") {
		if (configLayout.value === "single") {
			// v8.x：图片在 public/images，配置写 /images/<name>
			const rel = item.replace(/^\/?images\//, "");
			return `/api/media?root=${kind}&f=${encodeURIComponent(rel)}`;
		}
		const rel = item.replace(/^\/+/, "").replace(/^(desktop|mobile)-banner\//, "");
		return `/api/media?root=${kind}&f=${encodeURIComponent(rel)}`;
	}
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

async function openPicker(list: string[], kind: "desktop" | "mobile") {
	pickerKind.value = kind;
	pickerList.value = list;
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

/** 图库文件 → 配置里的路径写法（随主题与布局不同） */
function configPathFor(name: string): string {
	if (theme.value === "mizuki") {
		if (configLayout.value === "single") return `/images/${name}`;
		return pickerKind.value === "desktop" ? `/assets/desktop-banner/${name}` : `/assets/mobile-banner/${name}`;
	}
	return `assets/images/${pickerKind.value === "desktop" ? "DesktopWallpaper" : "MobileWallpaper"}/${name}`;
}

function addManual() {
	const p = manualPath.value.trim();
	if (!p) return;
	const value =
		p.startsWith("/") || /^https?:\/\//.test(p)
			? p
			: theme.value === "mizuki"
				? configPathFor(p)
				: `assets/images/${pickerKind.value === "desktop" ? "DesktopWallpaper" : "MobileWallpaper"}/${p}`;
	const list = pickerList.value;
	if (list && !list.includes(value)) list.push(value);
	manualPath.value = "";
	ElMessage.success("已加入列表");
}

function confirmPicker() {
	const list = pickerList.value;
	if (!list) return;
	for (const name of pickerSelected.value) {
		const value = configPathFor(name);
		if (!list.includes(value)) list.push(value);
	}
	pickerVisible.value = false;
	ElMessage.success("已加入列表，记得保存");
}

async function saveAll() {
	saving.value = true;
	try {
		if (theme.value === "mizuki") {
			const siteFields = [
				{ path: "wallpaperMode.defaultMode", value: mz.value.mode },
				{ path: "banner.src.desktop", value: [...mz.value.bannerDesktop] },
				{ path: "banner.src.mobile", value: [...mz.value.bannerMobile] },
				{ path: "banner.homeText.enable", value: home.value.enable },
				{ path: "banner.homeText.title", value: home.value.title },
				{ path: "banner.homeText.subtitle", value: [...home.value.subtitle.filter((s) => s.trim())] },
			];
			// v8.x 的 fullscreenWallpaperConfig 没有 enable 字段
			const wallFields = [
				...(configLayout.value !== "single" ? [{ path: "enable", value: mz.value.enable }] : []),
				{ path: "position", value: mz.value.position },
				{ path: "carousel.enable", value: mz.value.carouselEnable },
				{ path: "carousel.interval", value: mz.value.interval },
				{ path: "opacity", value: mz.value.opacity },
				{ path: "blur", value: mz.value.blur },
				{ path: "src.desktop", value: [...mz.value.fullDesktop] },
				{ path: "src.mobile", value: [...mz.value.fullMobile] },
			];
			const siteFile = configLayout.value === "single" ? "config.ts" : "siteConfig.ts";
			const wallFile = configLayout.value === "single" ? "config.ts" : "backgroundWallpaper.ts";
			await api.configs.saveFields(siteFile, siteFields);
			await api.configs.saveFields(wallFile, wallFields);
		} else {
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
				{ path: "common.homeText.enable", value: home.value.enable },
				{ path: "common.homeText.title", value: home.value.title },
				{ path: "common.homeText.subtitle", value: [...home.value.subtitle.filter((s) => s.trim())] },
				{ path: "common.homeText.linksEnable", value: v.value.linksEnable },
				{ path: "common.homeText.links", value: links },
			]);
		}
		ElMessage.success("已保存，建议重启博客 dev server");
		await (theme.value === "mizuki" ? loadMizuki() : load());
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

.page-card {
	margin-bottom: 16px;
}

.mz-form {
	max-width: 560px;
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
