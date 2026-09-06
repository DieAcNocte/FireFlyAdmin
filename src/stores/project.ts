import { reactive, computed } from "vue";
import { api, type ProjectProfile, type ThemeCapabilities } from "../api";

interface ProjectState {
	projects: ProjectProfile[];
	activeProjectId: string;
	loaded: boolean;
	/** 激活项目的主题能力（FireFly / Mizuki 适配） */
	theme: ThemeCapabilities | null;
}

export const projectStore = reactive<ProjectState>({
	projects: [],
	activeProjectId: "",
	loaded: false,
	theme: null,
});

export const activeProject = computed<ProjectProfile | undefined>(() =>
	projectStore.projects.find((p) => p.id === projectStore.activeProjectId)
);

/** 拉取激活项目的主题能力（失败时置空，各页面自行降级） */
export async function refreshTheme(silent = true): Promise<void> {
	try {
		projectStore.theme = await api.theme.get();
	} catch (e) {
		projectStore.theme = null;
		if (!silent) throw e;
	}
}

export async function loadProjects(silent = false): Promise<void> {
	try {
		const res = await api.projects.list();
		projectStore.projects = res.projects;
		projectStore.activeProjectId = res.activeProjectId;
		projectStore.loaded = true;
	} catch (e) {
		if (!silent) throw e;
	}
	await refreshTheme();
}

export async function switchProject(id: string): Promise<void> {
	await api.projects.activate(id);
	projectStore.activeProjectId = id;
	await refreshTheme();
	// 触发全局刷新：各页面监听 activeProjectId
	window.dispatchEvent(new CustomEvent("project-switched", { detail: id }));
}
