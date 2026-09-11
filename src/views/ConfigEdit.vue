<template>
	<div>
		<div class="toolbar">
			<el-button @click="router.back()">← 返回</el-button>
		</div>
		<ConfigForm v-if="file" :key="file" :file="file" />
		<el-empty v-else description="未指定配置文件" />
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import ConfigForm from "../components/ConfigForm.vue";

const route = useRoute();
const router = useRouter();
const file = computed(() => String(route.query.file || ""));
</script>
