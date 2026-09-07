<template>
	<div>
		<div class="toolbar">
			<el-button @click="router.back()">← 返回</el-button>
		</div>
		<AlbumImages v-if="albumId" :key="albumId" :album-id="albumId" :album-name="albumName" />
		<el-empty v-else description="未指定相册" />
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import AlbumImages from "../components/AlbumImages.vue";

const route = useRoute();
const router = useRouter();
const albumId = computed(() => String(route.query.albumId || ""));
const albumName = computed(() => String(route.query.name || ""));
</script>
