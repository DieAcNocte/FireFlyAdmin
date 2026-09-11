<template>
	<div class="wizard-wrap">
		<el-card shadow="never" class="wizard-card">
			<div class="wizard-head">
				<span class="brand"><img :src="apiUrl('/api/app/icon')" class="brand-icon" alt="" /> FireFly管理后台 · 初始设置</span>
				<span class="sub">首次使用请完成以下 {{ steps.length }} 步（可随时在「应用设置」重新运行）</span>
			</div>
			<el-steps :active="step" align-center finish-status="success" class="steps">
				<el-step title="界面配色" />
				<el-step title="主题框架" />
				<el-step title="本地文件夹" />
				<el-step title="远程仓库" />
				<el-step title="同步" />
			</el-steps>

			<!-- 第 1 步：界面配色 -->
			<div v-if="step === 0" class="step-body">
				<p class="hint">选择管理后台的界面配色，选中后立即生效，完成后自动记住。</p>
				<div class="theme-row">
					<div class="theme-card" :class="{ active: colorMode === 'light' }" @click="pickTheme('light')">
						<div class="theme-preview light-preview"><span>浅色模式</span></div>
					</div>
					<div class="theme-card" :class="{ active: colorMode === 'dark' }" @click="pickTheme('dark')">
						<div class="theme-preview dark-preview"><span>深色模式</span></div>
					</div>
				</div>
			</div>

			<!-- 第 2 步：主题框架 -->
			<div v-else-if="step === 1" class="step-body">
				<p class="hint">你的博客用的是什么主题框架？后台会按对应约定管理相册、日记、壁纸与配置。</p>
				<div class="fw-row">
					<div
						v-for="fw in FRAMEWORKS"
						:key="fw.id"
						class="fw-card"
						:class="{ active: form.framework === fw.id }"
						@click="form.framework = fw.id"
					>
						<div class="fw-name">{{ fw.name }}</div>
						<div class="fw-desc">{{ fw.desc }}</div>
					</div>
				</div>
				<div class="warn-tip" style="margin-top: 12px">
					选择后会在「远程仓库」一步预填对应的上游模板地址，方便直接拉取一份模板内容作为博客起点；
					之后也能在「应用设置 → 博客模式」中改为自动识别。
				</div>
			</div>

			<!-- 第 3 步：本地文件夹 -->
			<div v-else-if="step === 2" class="step-body">
				<p class="hint">设置你要管理的博客本地文件夹（FireFly / Mizuki / Fuwari 博客均可）。</p>
				<el-form label-width="90px">
					<el-form-item label="项目名称">
						<el-input v-model="form.name" placeholder="如：我的博客" />
					</el-form-item>
					<el-form-item label="文件夹地址" required>
						<el-input v-model="form.localPath" placeholder="D:\Documents\ZcodeProject\MyBlog">
							<template #append>
								<el-button :loading="validating" @click="validate">检测</el-button>
							</template>
						</el-input>
						<div class="result" :class="validation ? (validation.ok ? 'ok' : 'bad') : ''">
							<template v-if="validation">
								{{ validation.ok ? "✓ 检测通过，是一个有效的博客目录" : "✗ " + validation.problems.join("；") }}
							</template>
						</div>
					</el-form-item>
					<el-form-item v-if="form.framework === 'firefly'" label="演示内容">
						<el-checkbox v-model="form.demo">生成默认演示内容</el-checkbox>
						<div class="warn-tip">
							⚠ 会清空该博客的文章与动态，只保留一篇「测试」文章、一条「测试」动态、
							一个普通相册 + 一个加密相册，壁纸只保留 D01 / M01。
							<b>适合全新空博客；已有内容的博客请勿勾选。</b>
						</div>
					</el-form-item>
					<el-form-item v-else label="演示内容">
						<div class="warn-tip" style="margin-top: 0">
							{{ form.framework === "mizuki" ? "Mizuki" : "Fuwari" }} 没有演示内容生成（那是 FireFly 专属）；
							下一步可在「同步」中直接拉取对应上游模板的内容作为起点。
						</div>
					</el-form-item>
				</el-form>
			</div>

			<!-- 第 4 步：远程仓库 -->
			<div v-else-if="step === 3" class="step-body">
				<p class="hint">配置 GitHub 远程仓库（用于发布与同步）。也可以暂时跳过，之后在「项目管理」中配置。</p>
				<el-form label-width="120px">
					<el-form-item label="仓库地址">
						<el-input v-model="form.remoteUrl" placeholder="https://github.com/用户名/仓库.git 或 git@github.com:用户名/仓库.git" />
					</el-form-item>
					<el-form-item label="认证方式">
						<el-radio-group v-model="authMode">
							<el-radio value="token">Token 密钥</el-radio>
							<el-radio value="ssh">SSH 密钥</el-radio>
						</el-radio-group>
					</el-form-item>
					<el-form-item v-if="authMode === 'token'" label="Token 密钥">
						<el-input v-model="form.token" type="password" show-password placeholder="GitHub Personal Access Token（repo 权限）" />
						<div class="warn-tip">GitHub → Settings → Developer settings → Personal access tokens → 生成经典 Token 并勾选 repo 权限后粘贴到这里。</div>
					</el-form-item>
					<el-form-item v-else label="SSH 密钥">
						<el-button :loading="keygenLoading" @click="genKey">{{ publicKey ? "重新查看公钥" : "生成本机 SSH 密钥" }}</el-button>
						<div v-if="publicKey" class="ssh-box">
							<el-input type="textarea" :rows="3" :model-value="publicKey" readonly />
							<el-button size="small" style="margin-top: 6px" @click="copyPub">复制公钥</el-button>
							<div class="warn-tip">
								已生成到 {{ keyPath }}。请把上面的公钥添加到：
								GitHub → Settings → SSH and GPG keys → New SSH key，保存后点「测试连接」。
							</div>
						</div>
						<div v-else class="warn-tip">没有本机密钥时可一键生成（ed25519），然后把公钥手动添加到 GitHub 账户。</div>
					</el-form-item>
					<el-form-item label="连接测试">
						<el-button :loading="testing" @click="testRemote">测试连接</el-button>
						<span class="result" :class="testResult ? (testResult.ok ? 'ok' : 'bad') : ''" style="margin-left: 10px">
							{{ testResult ? testResult.message : "" }}
						</span>
					</el-form-item>
				</el-form>
				<el-link type="info" @click="skipRemote">暂时跳过，之后在「项目管理」配置 →</el-link>
			</div>

			<!-- 第 5 步：同步 -->
			<div v-else-if="step === 4" class="step-body">
				<p class="hint">
					从远程仓库拉取内容到本地：本地为空目录时执行克隆；已有仓库时拉取远程更新（仅快进合并，不会覆盖未提交的本地修改）。
				</p>
				<el-alert v-if="!form.remoteUrl" type="info" :closable="false" title="第 3 步已跳过：没有配置远程仓库，本步可以跳过，之后可在「项目管理」配置后再同步。" />
				<template v-else>
					<el-descriptions :column="2" border>
						<el-descriptions-item label="仓库">{{ form.remoteUrl }}</el-descriptions-item>
						<el-descriptions-item label="分支">{{ form.branch || "master" }}</el-descriptions-item>
					</el-descriptions>
					<el-button type="primary" :loading="syncing" style="margin-top: 14px" @click="doSync">开始同步</el-button>
					<div v-if="syncMessage" class="result" :class="syncOk ? 'ok' : 'bad'">{{ syncMessage }}</div>
				</template>
			</div>

			<div class="wizard-foot">
				<el-button v-if="step > 0" @click="step--">上一步</el-button>
				<el-button v-if="step < 4" type="primary" :disabled="!canNext" :loading="advancing" @click="next">
					下一步
				</el-button>
				<el-button v-else type="success" :loading="finishing" :disabled="!!form.remoteUrl && !syncOk" @click="finish">
					完成，进入管理后台
				</el-button>
			</div>
		</el-card>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api";
import { apiUrl } from "../api/base";
import { applyColorMode } from "../theme";
import { loadProjects, refreshTheme } from "../stores/project";

const emit = defineEmits<{ (e: "finished"): void }>();

const steps = ["配色", "框架", "目录", "远程", "同步"];
const step = ref(0);
const loading = ref(false);

/** 主题框架清单：决定演示内容可见性、上游仓库预填与博客模式偏好 */
const FRAMEWORKS = [
	{
		id: "firefly" as const,
		name: "FireFly",
		desc: "功能最全的派生主题：相册 / 动态 / 追番 / 书签导航等，支持生成演示内容",
		upstream: "https://github.com/CuteLeaf/Firefly.git",
		branch: "master",
	},
	{
		id: "mizuki" as const,
		name: "Mizuki",
		desc: "Material Design 3 风格（v8 / v9 布局均已适配），相册与日记走数据文件",
		upstream: "https://github.com/LyraVoid/Mizuki.git",
		branch: "master",
	},
	{
		id: "fuwari" as const,
		name: "Fuwari",
		desc: "原版轻量主题：无相册 / 日记模块，仅文章与页面管理",
		upstream: "https://github.com/saicaca/fuwari.git",
		branch: "main",
	},
];
const KNOWN_UPSTREAMS = new Set(FRAMEWORKS.map((f) => f.upstream));

const colorMode = ref<"light" | "dark" | "system">("light");
const form = ref({
	name: "我的博客",
	localPath: "",
	remoteUrl: "",
	token: "",
	branch: "master",
	demo: false,
	framework: "firefly" as "firefly" | "mizuki" | "fuwari",
});
const validation = ref<{ ok: boolean; problems: string[] } | null>(null);
const authMode = ref<"token" | "ssh">("token");
const publicKey = ref("");
const keyPath = ref("");
const testResult = ref<{ ok: boolean; message: string } | null>(null);
const syncing = ref(false);
const syncOk = ref(false);
const syncMessage = ref("");
const validating = ref(false);
const advancing = ref(false);
const finishing = ref(false);
const keygenLoading = ref(false);
const testing = ref(false);
let projectId = "";

onMounted(async () => {
	loading.value = true;
	try {
		const st = await api.setup.status();
		form.value.localPath = st.project.localPath || "";
		form.value.remoteUrl = st.project.remoteUrl || "";
		form.value.branch = st.project.branch || "master";
		projectId = st.project.id;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		loading.value = false;
	}
});

const canNext = computed(() => {
	if (step.value === 0) return true;
	if (step.value === 1) return true; // 框架有默认值
	if (step.value === 2) return !!validation.value?.ok && !!form.value.localPath.trim();
	if (step.value === 3) return true; // 可跳过
	return true;
});

function pickTheme(mode: "light" | "dark") {
	colorMode.value = mode;
	applyColorMode(mode);
}

/** 离开「主题框架」步骤：持久化博客模式偏好，并预填对应上游仓库与分支（未手动填写时） */
async function applyFramework() {
	const fw = FRAMEWORKS.find((f) => f.id === form.value.framework)!;
	await api.app.savePrefs({ blogMode: fw.id === "fuwari" ? "auto" : fw.id });
	await refreshTheme();
	if (!form.value.remoteUrl.trim() || KNOWN_UPSTREAMS.has(form.value.remoteUrl.trim())) {
		form.value.remoteUrl = fw.upstream;
	}
	if (!form.value.branch.trim() || form.value.branch === "master" || form.value.branch === "main") {
		form.value.branch = fw.branch;
	}
}

async function validate() {
	validating.value = true;
	try {
		validation.value = await api.projects.validate(form.value.localPath);
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		validating.value = false;
	}
}

/** 第 3 步通过：填入占位项目 / 复用同路径项目 / 新建项目并激活；FireFly 勾选了演示内容则生成 */
async function ensureProject() {
	const st = await api.setup.status();
	if (!st.project.localPath) {
		// 首次安装的默认占位项目：直接填入用户自己的博客目录
		projectId = st.project.id;
		await api.projects.update(projectId, {
			name: form.value.name,
			localPath: form.value.localPath,
			branch: form.value.branch,
		});
		await api.projects.activate(projectId);
	} else {
		const list = await api.projects.list();
		const existing = list.projects.find((p) => p.localPath === form.value.localPath.trim());
		if (existing) {
			projectId = existing.id;
			await api.projects.update(existing.id, { name: form.value.name });
		} else {
			const created = await api.projects.create({
				name: form.value.name || "我的博客",
				localPath: form.value.localPath,
				branch: form.value.branch,
			});
			projectId = created.id;
		}
		await api.projects.activate(projectId);
	}
	await loadProjects();
	if (form.value.demo) {
		await api.setup.demo();
		ElMessage.success("已生成默认演示内容（测试文章/动态、演示相册、D01+M01 壁纸）");
	}
}

async function next() {
	advancing.value = true;
	try {
		if (step.value === 1) {
			await applyFramework();
		} else if (step.value === 2) {
			await ensureProject();
		} else if (step.value === 3) {
			// 保存远程配置（token 留空则保留原值）
			await api.projects.update(projectId, {
				remoteUrl: form.value.remoteUrl.trim(),
				token: form.value.token || undefined,
				branch: form.value.branch,
			});
		}
		step.value++;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		advancing.value = false;
	}
}

function skipRemote() {
	form.value.remoteUrl = "";
	testResult.value = null;
	step.value = 4;
}

async function genKey() {
	keygenLoading.value = true;
	try {
		const r = await api.setup.sshKeygen();
		publicKey.value = r.publicKey;
		keyPath.value = r.keyPath;
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		keygenLoading.value = false;
	}
}

async function copyPub() {
	try {
		await navigator.clipboard.writeText(publicKey.value);
		ElMessage.success("公钥已复制");
	} catch {
		ElMessage.warning("复制失败，请手动选择文本复制");
	}
}

async function testRemote() {
	if (!form.value.remoteUrl.trim()) {
		ElMessage.warning("请先填写仓库地址");
		return;
	}
	testing.value = true;
	try {
		const r = await api.setup.testRemote(form.value.remoteUrl.trim(), authMode.value === "token" ? form.value.token : undefined);
		testResult.value = { ok: true, message: r.message };
	} catch (e) {
		testResult.value = { ok: false, message: e instanceof Error ? e.message : String(e) };
	} finally {
		testing.value = false;
	}
}

async function doSync() {
	syncing.value = true;
	syncMessage.value = "";
	try {
		const r = await api.setup.sync();
		syncOk.value = true;
		syncMessage.value = "✓ " + r.message;
	} catch (e) {
		syncOk.value = false;
		syncMessage.value = "✗ " + (e instanceof Error ? e.message : String(e));
	} finally {
		syncing.value = false;
	}
}

async function finish() {
	finishing.value = true;
	try {
		await api.setup.complete();
		await loadProjects();
		emit("finished");
	} catch (e) {
		ElMessage.error(e instanceof Error ? e.message : String(e));
	} finally {
		finishing.value = false;
	}
}
</script>

<style scoped>
.wizard-wrap {
	min-height: calc(100vh - 40px);
	display: flex;
	align-items: center;
	justify-content: center;
}

.wizard-card {
	width: 760px;
	max-width: 96vw;
}

.wizard-head {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-bottom: 18px;
}

.brand {
	font-size: 18px;
	font-weight: 700;
}

.sub {
	color: #909399;
	font-size: 12px;
}

.steps {
	margin-bottom: 24px;
}

.step-body {
	min-height: 220px;
}

.hint {
	color: #606266;
	margin: 0 0 16px;
}

.theme-row {
	display: flex;
	gap: 20px;
	justify-content: center;
}

.theme-card {
	cursor: pointer;
	border: 3px solid transparent;
	border-radius: 10px;
	overflow: hidden;
	transition: all 0.2s;
}

.theme-card.active {
	border-color: var(--el-color-primary);
}

.theme-preview {
	width: 220px;
	height: 130px;
	display: flex;
	align-items: flex-end;
	justify-content: center;
	padding-bottom: 10px;
	font-weight: 600;
}

.fw-row {
	display: flex;
	gap: 16px;
	justify-content: center;
}

.fw-card {
	cursor: pointer;
	width: 210px;
	border: 2px solid var(--el-border-color-lighter);
	border-radius: 10px;
	padding: 14px 16px;
	transition: all 0.2s;
	background: var(--el-bg-color);
}

.fw-card:hover {
	border-color: var(--el-color-primary-light-5);
}

.fw-card.active {
	border-color: var(--el-color-primary);
	box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}

.fw-name {
	font-weight: 700;
	font-size: 15px;
	margin-bottom: 6px;
}

.fw-desc {
	color: #909399;
	font-size: 12px;
	line-height: 1.6;
}

.light-preview {
	background: linear-gradient(180deg, #ffffff 60%, #f0f2f5);
	color: #303133;
	border: 1px solid #e4e7ed;
}

.dark-preview {
	background: linear-gradient(180deg, #2b2b31 40%, #141414);
	color: #e5eaf3;
}

.result {
	margin-top: 6px;
	font-size: 13px;
}

.result.ok {
	color: var(--el-color-success);
}

.result.bad {
	color: var(--el-color-danger);
}

.warn-tip {
	color: #909399;
	font-size: 12px;
	line-height: 1.6;
	margin-top: 6px;
}

.ssh-box {
	margin-top: 8px;
	width: 100%;
}

.wizard-foot {
	display: flex;
	justify-content: center;
	gap: 12px;
	margin-top: 20px;
	padding-top: 16px;
	border-top: 1px solid var(--el-border-color-lighter);
}
</style>
