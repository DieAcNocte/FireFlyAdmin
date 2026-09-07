<template>
	<div>
		<div class="toolbar">
			<el-button @click="router.back()">← 返回</el-button>
		</div>
		<PageEditor v-if="file" :key="file" :file="file" />
		<el-empty v-else description="未指定页面" />
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageEditor from "../components/PageEditor.vue";

const route = useRoute();
const router = useRouter();
const file = computed(() => String(route.query.file || ""));
</script>
