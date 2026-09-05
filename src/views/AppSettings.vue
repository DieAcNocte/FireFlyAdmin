<template>
	<div v-loading="loading" class="prefs">
		<el-card shadow="never" class="page-card">
			<template #header>
				<div class="card-header">
					<span>应用偏好</span>
					<el-button type="primary" :loading="saving" @click="save">保存</el-button>
				</div>
			</template>
			<el-form label-width="180px">
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
			</el-form>
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
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { api, type AppPreferences, type AppRuntime } from "../api";
import FieldTip from "../components/FieldTip.vue";
import { applyColorMode } from "../theme";

const loading = ref(false);
const saving = ref(false);
const form = ref<AppPreferences>({ uploadConvertAvif: true, closeAction: "exit", port: 5175, colorMode: "light" });
const runtime = ref<AppRuntime | null>(null);

function onColorModeChange(mode: string) {
	applyColorMode(mode);
}

onMounted(load);

async function load() {
	loading.value = true;
	try {
		const [p, r] = await Promise.all([api.app.prefs(), api.app.runtime()]);
		form.value = { ...p };
		runtime.value = r;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
}

async function save() {
	saving.value = true;
	try {
		const res = await api.app.savePrefs({ ...form.value });
		form.value = { ...res.preferences };
		ElMessage.success("已保存" + (res.preferences.port !== runtime.value?.port ? "（端口修改将在重启后生效）" : ""));
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
</script>

<style scoped>
.card-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}
</style>
