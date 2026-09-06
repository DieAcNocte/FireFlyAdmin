import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
	plugins: [vue()],
	server: {
		port: 5176,
		proxy: {
			"/api": "http://127.0.0.1:5175",
		},
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
});
