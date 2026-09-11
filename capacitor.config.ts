import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor 配置：将构建产物（dist/）打包为原生 App 壳，
 * API 请求指向电脑端 Hono 服务（在 App 内首次启动时配置服务器地址）。
 */
const config: CapacitorConfig = {
	appId: "com.firefly.admin",
	appName: "FireFly Admin",
	webDir: "dist",
	android: {
		// UI 通过 https://localhost 加载，访问局域网 http:// 的 API 与图片需允许混合内容
		allowMixedContent: true,
	},
	plugins: {
		// 软键盘弹出时压缩 WebView，编辑器页面不被遮挡
		Keyboard: {
			resize: "native",
		},
	},
};

export default config;
