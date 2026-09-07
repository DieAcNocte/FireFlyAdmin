<template>
	<div v-loading="loading" class="prefs">
		<template v-if="showServerCards">
		<el-card shadow="never" class="page-card">
			<template #header>
				<div class="card-header">
					<span>应用偏好</span>
					<el-button type="primary" :loading="saving" @click="save">保存</el-button>
				</div>
			</template>
			<el-form :label-position="formLabelPos" label-width="180px">
				<el-form-item label="上传图片默认转 AVIF">
					<el-switch v-model="form.uploadConvertAvif" />
					<FieldTip text="开启后，相册页与主页图片页上传图片时默认勾选「转 AVIF」（体积更小），每次上传前仍可手动取消勾选。" />
				</el-form-item>

				<el-form-item label="默认端口">
					<el-input-number v-model="form.port" :min="1024" :max="65535" :step="1" />
					<FieldTip text="管理后台的访问端口，默认 5175。修改后需要重新打开 FireflyAdmin.exe（或重启脚本服务）才能生效；若端口被占用，启动会失败，请更换端口。" />
				</el-form-item>

				<el-form-item label="界面配色">
					<el-radio-group v-model="form.colorMode" @change="onColorModeChange">
						<el-radio value="light">浅色</el-radio>
						<el-radio value="dark">深色</el-radio>
						<el-radio value="system">跟随系统</el-radio>
					</el-radio-group>
					<FieldTip text="管理后台自身的亮暗配色，选中后立即预览，点击「保存」后持久生效。「跟随系统」会随操作系统的亮暗模式自动切换。" />
				</el-form-item>

				<el-form-item label="关闭窗口时">
					<el-radio-group v-model="form.closeAction">
						<el-radio value="exit">直接退出</el-radio>
						<el-radio value="background">转入后台继续运行</el-radio>
					</el-radio-group>
					<FieldTip text="仅对 EXE 生效：「直接退出」= 关闭应用窗口（或控制台窗口）时同时停止服务；「转入后台继续运行」= 关闭窗口后服务在后台继续运行，重新双击 FireflyAdminApp.exe 可秒开，也可在下方「停止服务」结束。立即生效，无需重启。" />
				</el-form-item>

				<el-form-item label="博客模式">
					<el-radio-group v-model="form.blogMode">
						<el-radio value="auto">自动识别</el-radio>
						<el-radio value="firefly">FireFly 模式</el-radio>
						<el-radio value="mizuki">Mizuki 模式</el-radio>
					</el-radio-group>
					<FieldTip text="决定管理后台按哪套主题约定工作（相册/日记/壁纸/配置表单等）。默认按当前项目的文件特征自动识别；若博客是魔改主题导致识别错误，可手动指定 FireFly 或 Mizuki 模式强制覆盖。切换后对当前激活项目立即生效。" />
				</el-form-item>
			</el-form>
		</el-card>

		<el-card shadow="never" class="page-card">
			<template #header>
				<div class="card-header">
					<span>移动端 / 局域网访问</span>
					<el-tag v-if="runtime?.lanAccess" type="success" effect="plain" size="small">已开启</el-tag>
				</div>
			</template>
			<el-form :label-position="formLabelPos" label-width="180px">
				<el-form-item label="允许局域网访问">
					<el-switch v-model="form.lanAccess" />
					<FieldTip text="开启后服务监听所有网卡，同一 Wi-Fi 下的手机/平板可通过下方地址访问（手机浏览器直接打开，或 FireFly 手机 App 中填入）。保存后需重启服务（重新打开 FireflyAdmin.exe）生效。" />
				</el-form-item>
				<el-form-item v-if="runtime?.lanAddresses?.length" label="局域网访问地址">
					<div class="lan-addrs">
						<el-tag v-for="a in runtime.lanAddresses" :key="a" type="info" effect="plain" class="lan-addr">{{ a }}</el-tag>
					</div>
					<FieldTip text="在手机端填入此地址（App 连接页或手机浏览器地址栏）。IP 由路由器分配，重启后如变化请以新地址为准；也可在电脑上配置固定 IP。" />
				</el-form-item>
				<el-form-item label="访问令牌">
					<el-input v-model="form.accessToken" placeholder="留空 = 局域网访问不鉴权（不推荐）" style="max-width: 320px" />
					<el-button style="margin-left: 8px" @click="regenToken">重新生成</el-button>
					<FieldTip text="局域网中的设备访问 API 时需携带此令牌，本机桌面端不受影响。手机端首次连接时填写一次即可；修改保存后已连接的手机端需在连接设置中同步更新。" />
				</el-form-item>
			</el-form>
		</el-card>

		<el-card shadow="never" class="page-card">
			<template #header>
				<div class="card-header">
					<span>初始设置与演示内容</span>
				</div>
			</template>
			<el-button @click="rerunWizard">重新运行初始设置向导</el-button>
			<FieldTip text="重新打开首次使用的五步向导：界面配色 → 主题框架 → 本地文件夹检测 → 远程仓库与密钥 → 同步。不会删除任何项目与配置。" />
			<el-button type="warning" plain style="margin-left: 12px" @click="resetDemo">重置为默认演示内容</el-button>
			<FieldTip text="对当前项目的博客执行：清空文章与动态并写入一篇「测试」文章/一条「测试」动态，相册只留一个普通 + 一个加密演示相册，壁纸只保留 D01/M01。⚠ 会清空当前博客已有内容，请务必确认！" />
			<div class="warn-tip" style="margin-top: 10px">
				⚠ 「重置为默认演示内容」直接作用于当前激活项目的博客目录，不可在后台撤销（已提交过的内容可通过博客 git 找回）。
			</div>
		</el-card>

		<el-card shadow="never" class="page-card">
			<template #header>
				<div class="card-header">
					<span>GitHub 强制同步</span>
					<el-tag type="danger" effect="dark" size="small">高风险</el-tag>
				</div>
			</template>
			<p class="warn-tip" style="margin-top: 0">
				从「项目管理」中配置的远程仓库拉取内容，并将本地博客目录<b>完全重置</b>为远程状态：
				所有未提交的修改会被丢弃、所有未跟踪的新文件会被删除。仅在本地内容损坏、
				或确定要以远程为准时使用。日常同步请使用向导中的普通同步（不会丢弃本地修改）。
			</p>
			<el-button type="danger" @click="forceSync">尝试与 GitHub 同步（覆盖本地）</el-button>
		</el-card>

		<el-card shadow="never">
			<template #header>
				<div class="card-header">
					<span>服务</span>
				</div>
			</template>
			<el-descriptions v-if="runtime" :column="3" border>
				<el-descriptions-item label="启动方式">{{ runtime.sea ? "FireflyAdmin.exe" : "脚本模式（pnpm）" }}</el-descriptions-item>
				<el-descriptions-item label="当前端口">{{ runtime.port }}</el-descriptions-item>
				<el-descriptions-item label="进程 PID">{{ runtime.pid }}</el-descriptions-item>
			</el-descriptions>
			<el-alert
				v-if="runtime?.sea"
				type="info"
				:closable="false"
				title="「停止服务」可结束后台运行的 FireflyAdmin.exe（页面将断开，需重新双击 EXE 启动）。"
				style="margin-top: 12px"
			>
				<el-button size="small" type="danger" @click="stopService">停止服务</el-button>
			</el-alert>
			<el-alert
				v-else
				type="info"
				:closable="false"
				title="当前为脚本模式（pnpm dev / pnpm start）。「关闭窗口时」与「停止服务」仅对 FireflyAdmin.exe 启动方式生效。"
			/>
		</el-card>
		</template>

		<el-card v-if="isNative && isGithubMode()" shadow="never" class="page-card">
			<template #header>
				<div class="card-header">
					<span>本地个性化设置</span>
					<el-tag size="small" type="info" effect="plain">保存在手机</el-tag>
				</div>
			</template>
			<el-form label-position="top">
				<el-form-item label="界面配色">
					<el-radio-group v-model="devColor" @change="onDevColor">
						<el-radio value="light">浅色</el-radio>
						<el-radio value="dark">深色</el-radio>
						<el-radio value="system">跟随系统</el-radio>
					</el-radio-group>
					<FieldTip text="App 自身的亮暗配色，保存在手机本地并立即生效，与电脑端设置互不影响。" />
				</el-form-item>
				<el-form-item label="博客模式">
					<el-radio-group v-model="devBlog" @change="onDevBlog">
						<el-radio value="auto">自动识别</el-radio>
						<el-radio value="firefly">FireFly 模式</el-radio>
						<el-radio value="mizuki">Mizuki 模式</el-radio>
					</el-radio-group>
					<FieldTip text="默认按仓库文件特征自动识别主题；若识别错误可强制指定，切换后立即重新探测。" />
				</el-form-item>
			</el-form>
			<div class="warn-tip">
				说明：这些偏好保存在手机本地，与电脑端的应用偏好互不影响。
			</div>
		</el-card>

		<el-card v-if="isNative" shadow="never" class="page-card">
			<template #header>
				<div class="card-header">
					<span>连接电脑端</span>
					<el-tag size="small" type="warning" effect="plain">实验功能</el-tag>
				</div>
			</template>
			<el-form :label-position="formLabelPos" label-width="180px" v-if="!isGithubMode()">
				<el-form-item label="当前连接方式">
					<el-tag type="success" effect="plain">电脑端（局域网）</el-tag>
				</el-form-item>
				<el-form-item label="切换连接方式">
					<el-button @click="switchToGithub">切回 GitHub 直连</el-button>
					<FieldTip text="切回后 App 使用 GitHub 直连模式（无需电脑在线）；电脑端地址与令牌会保留在本机，随时可再切换回来。" />
				</el-form-item>
			</el-form>
			<el-form :label-position="formLabelPos" label-width="180px" v-else>
				<el-form-item label="当前连接方式">
					<el-tag type="info" effect="plain">GitHub 直连</el-tag>
				</el-form-item>
				<el-form-item label="服务器地址">
					<el-input v-model="expUrl" placeholder="http://192.168.1.5:5175" style="max-width: 340px" />
					<FieldTip text="电脑端「应用设置 → 移动端 / 局域网访问」开启后显示的局域网地址。连接后 App 切换为电脑端模式（功能更全，但使用时需电脑在线）。" />
				</el-form-item>
				<el-form-item label="访问令牌">
					<el-input v-model="expToken" show-password placeholder="服务端未设置令牌可留空" style="max-width: 340px" />
				</el-form-item>
				<el-form-item label=" " :label-width="isMobile ? '0' : '180px'">
					<el-button :loading="expTesting" @click="testExpServer">测试连接</el-button>
					<el-button type="primary" :loading="expSaving" @click="switchToServer">保存并切换为电脑端</el-button>
				</el-form-item>
			</el-form>
			<div class="warn-tip" style="margin-top: 8px">
				实验说明：电脑端连接目前为实验性支持，日常使用推荐 GitHub 直连。各连接方式的配置分别保存在本机，切换时互不清除。
			</div>
		</el-card>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { api, type AppPreferences, type AppRuntime } from "../api";
import { isNative, isGithubMode, isMobile, serverUrl, serverToken, saveServerConfig, switchConnMode, deviceColorMode, deviceBlogMode, saveDeviceColorMode, saveDeviceBlogMode } from "../api/base";
import { activeProject, refreshTheme } from "../stores/project";
import FieldTip from "../components/FieldTip.vue";
import { applyColorMode } from "../theme";

/** 表单标签布局：手机端文字在上（top），电脑端保持右侧标签原样 */
const formLabelPos = computed(() => (isMobile ? "top" : "right"));

const loading = ref(false);
const saving = ref(false);

/** 电脑端偏好等卡片仅在本机/服务器模式可用；GitHub 直连模式下应用设置只展示实验功能 */
const showServerCards = computed(() => !isNative || !isGithubMode());

// ── 实验功能：电脑端（局域网）连接 ──
const expUrl = ref(serverUrl.value);
const expToken = ref(serverToken.value);
const expTesting = ref(false);
const expSaving = ref(false);

async function testExpServer() {
	expTesting.value = true;
	try {
		const base = expUrl.value.trim().replace(/\/+$/, "");
		if (!base) throw new Error("请先填写服务器地址");
		const headers: Record<string, string> = {};
		if (expToken.value.trim()) headers["Authorization"] = `Bearer ${expToken.value.trim()}`;
		const res = await fetch(`${base}/api/health`, { headers });
		if (res.status === 401) throw new Error("连接成功，但令牌不正确或未填写");
		if (!res.ok) throw new Error(`服务器响应异常 (${res.status})`);
		ElMessage.success("连接成功");
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		expTesting.value = false;
	}
}

async function switchToServer() {
	const base = expUrl.value.trim().replace(/\/+$/, "");
	if (!base) {
		ElMessage.warning("请先填写服务器地址");
		return;
	}
	expSaving.value = true;
	try {
		await saveServerConfig(base, expToken.value);
		location.reload();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		expSaving.value = false;
	}
}

async function switchToGithub() {
	await switchConnMode("github");
	location.reload();
}

// ── 本地偏好（直连模式：保存在手机本地）──
const devColor = ref<"light" | "dark" | "system">(deviceColorMode.value);
const devBlog = ref<"auto" | "firefly" | "mizuki">(deviceBlogMode.value);

async function onDevColor(mode: string) {
	const m = mode as "light" | "dark" | "system";
	applyColorMode(m);
	await saveDeviceColorMode(m);
}

async function onDevBlog(mode: string) {
	await saveDeviceBlogMode(mode as "auto" | "firefly" | "mizuki");
	await refreshTheme();
	ElMessage.success("已切换博客模式");
}
const form = ref<AppPreferences>({ uploadConvertAvif: true, closeAction: "exit", port: 5175, colorMode: "light", blogMode: "auto", lanAccess: false, accessToken: "" });
const runtime = ref<AppRuntime | null>(null);
/** 最近一次持久化的博客模式，用于判断保存时是否发生了切换 */
const lastSavedMode = ref<"auto" | "firefly" | "mizuki">("auto");

function onColorModeChange(mode: string) {
	applyColorMode(mode);
}

/** 生成随机访问令牌（32 位十六进制） */
function regenToken() {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	form.value.accessToken = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

onMounted(load);

async function load() {
	if (isNative && isGithubMode()) return; // GitHub 直连模式：应用偏好等电脑端设置不可用，仅展示实验功能
	loading.value = true;
	try {
		const [p, r] = await Promise.all([api.app.prefs(), api.app.runtime()]);
		form.value = { ...p };
		lastSavedMode.value = p.blogMode;
		runtime.value = r;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

async function save() {
	const modeChanged = runtime.value !== null && form.value.blogMode !== lastSavedMode.value;
	saving.value = true;
	try {
		const res = await api.app.savePrefs({ ...form.value });
		form.value = { ...res.preferences };
		lastSavedMode.value = res.preferences.blogMode;
		if (modeChanged) {
			// 博客模式变了：刷新主题能力，并让各页面重新按能力渲染
			await refreshTheme();
			window.dispatchEvent(new CustomEvent("project-switched", { detail: activeProject?.value?.id ?? "" }));
		}
		ElMessage.success(
			"已保存" +
				(res.preferences.port !== runtime.value?.port ? "（端口修改将在重启后生效）" : "") +
				(modeChanged ? "（博客模式已切换）" : "")
		);
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		saving.value = false;
	}
}

async function stopService() {
	await ElMessageBox.confirm(
		"确定停止后台服务？停止后浏览器页面将无法访问，需重新双击 FireflyAdmin.exe 启动。",
		"停止确认",
		{ type: "warning" }
	);
	try {
		await api.app.stop();
		ElMessage.success("服务已停止");
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}

async function rerunWizard() {
	await ElMessageBox.confirm("将重新打开首次使用的四步设置向导（不会删除任何项目与配置），确定？", "重新运行向导", { type: "info" });
	try {
		await api.setup.rerun();
		location.reload();
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}

async function resetDemo() {
	const project = activeProject?.value;
	const name = project?.name || "";
	await ElMessageBox.prompt(
		"⚠ 高风险操作：将对下面的博客目录执行重置——\n\n" +
			"项目名称：" + name + "\n" +
			"博客路径：" + (project?.localPath || "") + "\n\n" +
			"重置内容：清空全部文章与动态，写入一篇「测试」文章和一条「测试」动态；" +
			"相册只保留一个普通 + 一个加密演示相册（图片目录清空）；壁纸只保留 D01 / M01。\n\n" +
			"已提交过的内容可通过博客 git 找回，但未提交的内容将丢失。\n\n" +
			"如需继续，请输入当前项目名称「" + name + "」以确认：",
		"重置为默认演示内容（高风险）",
		{
			type: "warning",
			confirmButtonText: "确认重置",
			cancelButtonText: "取消",
			inputPattern: new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"),
			inputErrorMessage: "项目名称不匹配，无法重置",
		}
	);
	try {
		const r = await api.setup.demo();
		ElMessage.success(`已重置为默认演示内容（${r.post} / ${r.dynamic}）`);
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}

async function forceSync() {
	const project = activeProject?.value;
	await ElMessageBox.confirm(
		"⚠ 这是高风险操作，请确认你知道自己在做什么：\n\n" +
			"执行后，本地博客目录（" + (project?.localPath || "当前项目") + "）将被完全重置为远程仓库 " +
			(project?.remoteUrl || "（未配置）") + " 的 " + (project?.branch || "master") +
			" 分支状态：\n\n" +
			"• 所有未提交的修改将被丢弃\n" +
			"• 所有未提交的新文件将被删除\n" +
			"• 本地内容将与远程完全一致，无法通过本后台撤销\n\n" +
			"确定要继续吗？",
		"高风险操作：强制与 GitHub 同步",
		{ type: "error", confirmButtonText: "我知道风险，覆盖本地", cancelButtonText: "取消", confirmButtonClass: "el-button--danger" }
	);
	try {
		const r = await api.setup.forceSync();
		ElMessage.success(r.message);
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	}
}
</script>

<style scoped>
.card-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.warn-tip {
	color: #909399;
	font-size: 12px;
	line-height: 1.6;
	margin-top: 6px;
}

.lan-addrs {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.lan-addr {
	font-family: Consolas, Monaco, monospace;
}
</style>
