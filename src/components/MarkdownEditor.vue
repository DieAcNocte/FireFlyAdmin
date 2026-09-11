<template>
	<div class="md-editor">
			<div class="md-editor-toolbar">
				<el-radio-group v-model="mode" size="small">
					<el-radio-button value="edit">编辑</el-radio-button>
					<el-radio-button v-if="!isMobileScreen" value="split">分屏</el-radio-button>
					<el-radio-button value="preview">预览</el-radio-button>
				</el-radio-group>
				<span class="hint">支持 Markdown 语法</span>
			</div>
		<div class="md-editor-body" :class="mode">
			<div v-if="mode !== 'preview'" class="pane editor-pane">
				<Codemirror
					ref="cmRef"
					v-model="modelProxy"
					:extensions="extensions"
					:style="{ height: '100%' }"
					placeholder="开始写作..."
				/>
			</div>
			<div v-if="mode !== 'edit'" class="pane preview-pane md-preview" v-html="html"></div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Codemirror } from "vue-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import markdownit from "markdown-it";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();

/** 手机窄屏：分屏无意义，默认纯编辑模式 */
const isMobileScreen = window.matchMedia("(max-width: 768px)").matches;
const mode = ref<"edit" | "split" | "preview">(isMobileScreen ? "edit" : "split");
const cmRef = ref();

const extensions = [markdown()];
const md = markdownit({ html: true, linkify: true, breaks: false });

const modelProxy = computed({
	get: () => props.modelValue,
	set: (v: string) => emit("update:modelValue", v),
});

const html = computed(() => md.render(props.modelValue || ""));

/** 在光标处插入文本（供插入图片等使用） */
function insertSnippet(text: string) {
	const view = cmRef.value?.view;
	if (view) {
		const sel = view.state.selection.main;
		view.dispatch({
			changes: { from: sel.from, to: sel.to, insert: text },
			selection: { anchor: sel.from + text.length },
		});
		view.focus();
	} else {
		emit("update:modelValue", props.modelValue + text);
	}
}

defineExpose({ insertSnippet });
</script>

<style scoped>
.md-editor {
	display: flex;
	flex-direction: column;
	border: 1px solid #e4e7ed;
	border-radius: 4px;
	background: #fff;
	overflow: hidden;
}

.md-editor-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 12px;
	border-bottom: 1px solid #e4e7ed;
	background: #fafafa;
}

.hint {
	color: #909399;
	font-size: 12px;
}

.md-editor-body {
	flex: 1;
	display: flex;
	min-height: 0;
	height: 100%;
}

.mode-edit .preview-pane,
.mode-split .preview-pane,
.mode-preview .editor-pane {
	display: none;
}

.pane {
	min-width: 0;
	overflow: auto;
}

.editor-pane {
	flex: 1;
}

.mode-split .pane {
	flex: 1;
	border-right: 1px solid #e4e7ed;
}

.mode-split .preview-pane {
	border-right: none;
	border-left: 1px solid #e4e7ed;
}

.preview-pane {
	flex: 1;
	padding: 12px 16px;
	border: none;
}

.md-editor :deep(.cm-editor) {
	height: 100%;
}

.md-editor :deep(.cm-editor.cm-focused) {
	outline: none;
}
</style>
