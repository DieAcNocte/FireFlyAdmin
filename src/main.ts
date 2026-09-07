import { createApp } from "vue";
import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import App from "./App.vue";
import router from "./router";
import "./style.css";
import { initApiBase } from "./api/base";

async function bootstrap() {
	// 原生壳下先读取服务器地址/令牌，再挂载应用（API 层依赖）
	await initApiBase();
	const app = createApp(App);
	app.use(router);
	app.use(ElementPlus, { locale: zhCn });
	for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
		app.component(key, component);
	}
	app.mount("#app");
}

bootstrap();
