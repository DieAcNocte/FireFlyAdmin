<template>
	<el-tooltip :content="text" placement="top" effect="dark" :show-after="100">
		<span class="field-tip">?</span>
	</el-tooltip>
</template>

<script setup lang="ts">
defineProps<{ text: string }>();
</script>

<style scoped>
.field-tip {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	margin-left: 8px;
	border-radius: 50%;
	background: #c0c4cc;
	color: #fff;
	font-size: 12px;
	line-height: 1;
	cursor: help;
	vertical-align: middle;
	flex-shrink: 0;
}
</style>
