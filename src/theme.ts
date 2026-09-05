/** 管理后台亮暗配色管理（应用设置 → 界面配色） */

let media: MediaQueryList | null = null;
let currentMode = "light";

export function applyColorMode(mode: string): void {
	currentMode = mode;
	ensureSystemListener();
	const dark =
		mode === "dark" ||
		(mode === "system" && (media ??= window.matchMedia("(prefers-color-scheme: dark)")).matches);
	document.documentElement.classList.toggle("dark", dark);
}

function ensureSystemListener(): void {
	if (media || typeof window.matchMedia !== "function") return;
	media = window.matchMedia("(prefers-color-scheme: dark)");
	media.addEventListener("change", () => {
		if (currentMode === "system") applyColorMode("system");
	});
}
