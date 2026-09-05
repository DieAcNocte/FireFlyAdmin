import { reactive, computed } from "vue";
import { api, type ProjectProfile } from "../api";

interface ProjectState {
	projects: ProjectProfile[];
	activeProjectId: string;
	loaded: boolean;
}

export const projectStore = reactive<ProjectState>({
	projects: [],
	activeProjectId: "",
	loaded: false,
});

export const activeProject = computed<ProjectProfile | undefined>(() =>
	projectStore.projects.find((p) => p.id === projectStore.activeProjectId)
);

export async function loadProjects(silent = false): Promise<void> {
	try {
		const res = await api.projects.list();
		projectStore.projects = res.projects;
		projectStore.activeProjectId = res.activeProjectId;
		projectStore.loaded = true;
	} catch (e) {
		if (!silent) throw e;
	}
}

export async function switchProject(id: string): Promise<void> {
	await api.projects.activate(id);
	projectStore.activeProjectId = id;
	// 触发全局刷新：各页面监听 activeProjectId
	window.dispatchEvent(new CustomEvent("project-switched", { detail: id }));
}
