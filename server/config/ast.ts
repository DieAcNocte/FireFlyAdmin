/**
 * 配置引擎：基于 TypeScript 编译器 API，对博客 src/config/*.ts 的导出对象
 * 做"字段路径级"读取与写回。
 *
 * 写回时只替换目标值节点的文本范围：
 * - 标量：只替换该字段的值（如 `title: "a"` 中引号内部分）
 * - 对象/数组：整块重新序列化（保持 Tab 缩进与项目风格），
 *   并尽量保留原有键顺序、未声明键与数组内部的文档注释
 */
import ts from "typescript";

export type PathSegment = string | number;

export function parseSource(code: string, fileName = "config.ts"): ts.SourceFile {
	return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TS);
}

export function findExportedObject(
	sf: ts.SourceFile,
	exportName: string
): ts.ObjectLiteralExpression | undefined {
	let found: ts.ObjectLiteralExpression | undefined;
	sf.forEachChild((node) => {
		if (found) return;
		if (!ts.isVariableStatement(node)) return;
		const isExport = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
		if (!isExport) return;
		for (const decl of node.declarationList.declarations) {
			if (!ts.isIdentifier(decl.name) || decl.name.text !== exportName) continue;
			let init = decl.initializer;
			if (init && ts.isAsExpression(init)) init = init.expression;
			if (init && ts.isObjectLiteralExpression(init)) {
				found = init;
				return;
			}
		}
	});
	return found;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(name)) return name.text;
	if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
	return undefined;
}

function findProperty(obj: ts.ObjectLiteralExpression, key: string): ts.PropertyAssignment | undefined {
	for (const prop of obj.properties) {
		if (ts.isPropertyAssignment(prop) && propertyNameText(prop.name) === key) return prop;
	}
	return undefined;
}

type EvalResult = { kind: "value"; value: unknown } | { kind: "error"; message: string };

/** 把 AST 字面量节点求值为普通 JS 值；无法求值时回退为原始源码文本 */
export function evaluateNode(node: ts.Expression): EvalResult {
	if (ts.isStringLiteral(node)) return { kind: "value", value: node.text };
	if (ts.isNumericLiteral(node)) return { kind: "value", value: Number(node.text) };
	if (node.kind === ts.SyntaxKind.TrueKeyword) return { kind: "value", value: true };
	if (node.kind === ts.SyntaxKind.FalseKeyword) return { kind: "value", value: false };
	if (node.kind === ts.SyntaxKind.NullKeyword) return { kind: "value", value: null };
	if (ts.isNoSubstitutionTemplateLiteral(node)) return { kind: "value", value: node.text };
	if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
		const inner = evaluateNode(node.operand);
		if (inner.kind === "value" && typeof inner.value === "number") {
			return { kind: "value", value: -inner.value };
		}
	}
	if (ts.isObjectLiteralExpression(node)) {
		const out: Record<string, unknown> = {};
		for (const prop of node.properties) {
			if (ts.isPropertyAssignment(prop)) {
				const key = propertyNameText(prop.name);
				if (key === undefined) continue;
				out[key] = unwrap(evaluateNode(prop.initializer));
			} else if (ts.isShorthandPropertyAssignment(prop)) {
				out[prop.name.text] = { __unresolved: prop.name.text };
			}
		}
		return { kind: "value", value: out };
	}
	if (ts.isArrayLiteralExpression(node)) {
		const out: unknown[] = [];
		for (const el of node.elements) {
			if (ts.isSpreadElement(el)) continue;
			out.push(unwrap(evaluateNode(el)));
		}
		return { kind: "value", value: out };
	}
	// 标识符 / 函数调用等无法静态求值（如 `SITE_LANG`、`resolvePageToggles({...})`）
	return { kind: "error", message: "该值是运行时表达式，无法静态解析" };
}

function unwrap(r: EvalResult): unknown {
	if (r.kind === "value") return r.value;
	return { __unresolved: r.message };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 沿路径定位节点；返回值节点与所在行缩进 */
function locateTarget(
	code: string,
	sf: ts.SourceFile,
	root: ts.ObjectLiteralExpression,
	segments: PathSegment[]
): { target: ts.Expression; lineIndent: string } {
	let current: ts.Expression = root;
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		if (typeof seg === "string") {
			if (!ts.isObjectLiteralExpression(current)) throw new Error(`路径中 "${seg}" 的父级不是对象`);
			const prop = findProperty(current, seg);
			if (!prop) throw new Error(`字段不存在: ${segments.slice(0, i + 1).join(".")}`);
			current = prop.initializer;
		} else {
			if (!ts.isArrayLiteralExpression(current)) throw new Error(`路径中 [${seg}] 的父级不是数组`);
			const el = current.elements[seg];
			if (!el || ts.isSpreadElement(el)) throw new Error(`数组下标不存在: [${seg}]`);
			current = el as ts.Expression;
		}
	}
	const lineIndent = lineIndentOf(code, current.getStart(sf));
	return { target: current, lineIndent };
}

function lineIndentOf(code: string, pos: number): string {
	const lineStart = code.lastIndexOf("\n", pos - 1) + 1;
	const lineText = code.slice(lineStart, pos);
	const m = lineText.match(/^[\t ]*/);
	return m ? m[0] : "";
}

function indentDepth(lineIndent: string): number {
	let d = 0;
	for (const ch of lineIndent) d += ch === "\t" ? 1 : 0.5;
	return Math.round(d);
}

/** 读取路径上的值（只支持纯字面量路径） */
export function readPath(
	code: string,
	exportName: string,
	segments: PathSegment[]
): { found: boolean; value?: unknown; error?: string } {
	const sf = parseSource(code);
	const root = findExportedObject(sf, exportName);
	if (!root) return { found: false, error: `未找到 export const ${exportName}` };
	try {
		const { target } = locateTarget(code, sf, root, segments);
		const r = evaluateNode(target);
		if (r.kind === "value") return { found: true, value: r.value };
		return { found: true, value: null, error: r.message };
	} catch (e) {
		return { found: false, error: e instanceof Error ? e.message : String(e) };
	}
}

type Entry = { key: string; value?: unknown; raw?: string; inline?: boolean; wrapped?: boolean };

/** 从原对象字面量收集有序条目（保留原始键顺序与未声明键；记录内联数组与换行风格） */
function collectEntries(obj: ts.ObjectLiteralExpression, code: string, sf: ts.SourceFile): Entry[] {
	const entries: Entry[] = [];
	for (const prop of obj.properties) {
		if (ts.isPropertyAssignment(prop)) {
			const key = propertyNameText(prop.name);
			if (key === undefined) continue;
			const r = evaluateNode(prop.initializer);
			if (r.kind === "value") {
				const inline =
					ts.isArrayLiteralExpression(prop.initializer) &&
					!code.slice(prop.initializer.getStart(sf), prop.initializer.getEnd()).includes("\n");
				const wrapped = code
					.slice(prop.name.getStart(sf), prop.initializer.getStart(sf))
					.includes("\n");
				entries.push({ key, value: r.value, inline, wrapped });
			} else entries.push({ key, raw: code.slice(prop.initializer.getStart(sf), prop.initializer.getEnd()) });
		} else if (ts.isShorthandPropertyAssignment(prop)) {
			entries.push({ key: prop.name.text, raw: prop.name.text });
		}
	}
	return entries;
}

/**
 * 合并：原条目顺序优先。
 * 新值语义：undefined = 未提供（保留原值）；null = 删除该键；其他 = 覆盖。
 */
function mergeEntries(original: Entry[], newValue: Record<string, unknown>): Entry[] {
	const out: Entry[] = [];
	const seen = new Set<string>();
	for (const e of original) {
		if (Object.hasOwn(newValue, e.key)) {
			const v = newValue[e.key];
			if (v === null) continue; // 显式删除
			if (v !== undefined) {
				out.push({ key: e.key, value: v, inline: e.inline, wrapped: e.wrapped });
				seen.add(e.key);
				continue;
			}
		}
		out.push(e);
		seen.add(e.key);
	}
	for (const [k, v] of Object.entries(newValue)) {
		if (!seen.has(k) && v !== undefined && v !== null) out.push({ key: k, value: v });
	}
	return out;
}

/** 提取数组 `[` 与第一个元素之间的注释块（原样保留文档注释） */
function collectInnerLeadingComments(node: ts.ArrayLiteralExpression, code: string): string[] {
	const openEnd = node.getStart() + 1; // `[` 之后
	const first = node.elements[0];
	if (first) {
		const ranges = ts.getLeadingCommentRanges(code, first.getFullStart());
		if (!ranges) return [];
		return ranges
			.filter((r) => r.pos >= openEnd)
			.map((r) => code.slice(r.pos, r.end).trimEnd());
	}
	// 空数组：粗略提取 [ ] 之间的注释行
	const segment = code.slice(openEnd, Math.max(node.getEnd() - 1, openEnd));
	const out: string[] = [];
	for (const m of segment.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g)) {
		out.push(m[0].trimEnd());
	}
	return out;
}

const INDENT = "\t";
const ind = (n: number) => INDENT.repeat(n);

function serializeValue(value: unknown, depth: number): string {
	if (value === null) return "null";
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
	if (typeof value === "boolean") return value ? "true" : "false";
	if (isPlainObject(value)) {
		if (typeof (value as any).__raw === "string") return (value as any).__raw;
		if (typeof (value as any).__unresolved === "string") return (value as any).__unresolved;
	}
	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		if (isScalarArray(value)) return serializeInlineArray(value);
		const lines = value.map((v) => ind(depth + 1) + serializeValue(v, depth + 1) + ",");
		return `[\n${lines.join("\n")}\n${ind(depth)}]`;
	}
	if (isPlainObject(value)) {
		const keys = Object.keys(value).filter((k) => value[k] !== undefined && value[k] !== null);
		if (keys.length === 0) return "{}";
		const lines = keys.map((k) => {
			const keyText = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
			return `${ind(depth + 1)}${keyText}: ${serializeValue(value[k], depth + 1)},`;
		});
		return `{\n${lines.join("\n")}\n${ind(depth)}}`;
	}
	return JSON.stringify(String(value));
}

function isScalarArray(items: unknown[]): boolean {
	return items.every((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean");
}

/** 内联数组（与项目中的 tags: ["a", "b"] 风格一致） */
function serializeInlineArray(items: unknown[]): string {
	if (items.length === 0) return "[]";
	if (!isScalarArray(items)) return "[]";
	return `[${items.map((v) => serializeValue(v, 0)).join(", ")}]`;
}

/** 数组专用序列化：parts 为已渲染的元素文本；注释行不带逗号，元素行带尾逗号 */
function serializeArrayParts(parts: string[], depth: number, innerComments: string[]): string {
	const lines: string[] = [];
	for (const c of innerComments) {
		// 注释按元素缩进级别重新缩进
		for (const line of c.split("\n")) {
			lines.push(line.trim() ? ind(depth + 1) + line.trimStart() : "");
		}
	}
	for (const p of parts) {
		lines.push(ind(depth + 1) + p + ",");
	}
	if (lines.length === 0) return "[]";
	return `[\n${lines.join("\n")}\n${ind(depth)}]`;
}

/** 按 Entry 列表渲染对象字面量（处理 raw / 内联数组 / 换行风格） */
function serializeEntriesBlock(entries: Entry[], depth: number): string {
	const lines = entries.map((e) => {
		const keyText = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(e.key) ? e.key : JSON.stringify(e.key);
		let valText: string;
		if (e.raw !== undefined) valText = e.raw;
		else if (e.inline && Array.isArray(e.value) && isScalarArray(e.value)) valText = serializeInlineArray(e.value) + ",";
		else valText = serializeValue(e.value, depth + 1) + ",";
		// 原文件里值换行书写（prettier 长行风格）→ 保持换行
		if (e.wrapped && e.raw === undefined) {
			valText = valText.replace(/,$/, "") + ",";
			return `${ind(depth + 1)}${keyText}:\n${ind(depth + 2)}${valText}`;
		}
		return `${ind(depth + 1)}${keyText}: ${valText}`;
	});
	if (lines.length === 0) return "{}";
	return `{\n${lines.join("\n")}\n${ind(depth)}}`;
}

function serializeMerged(
	node: ts.Expression,
	newValue: unknown,
	code: string,
	sf: ts.SourceFile,
	depth: number
): string {
	// 对象：与原键顺序合并
	if (ts.isObjectLiteralExpression(node) && isPlainObject(newValue)) {
		const original = collectEntries(node, code, sf);
		return serializeEntriesBlock(mergeEntries(original, newValue), depth);
	}
	// 数组：与原元素合并（对象元素逐键合并），保留内部注释
	if (ts.isArrayLiteralExpression(node) && Array.isArray(newValue)) {
		const wasInline = !code.slice(node.getStart(), node.getEnd()).includes("\n");
		const comments = wasInline ? [] : collectInnerLeadingComments(node, code);
		const parts: string[] = [];
		const originalElements = node.elements;
		for (let i = 0; i < newValue.length; i++) {
			const nv = newValue[i];
			const origEl = originalElements[i];
			if (origEl && !ts.isSpreadElement(origEl) && ts.isObjectLiteralExpression(origEl) && isPlainObject(nv)) {
				const original = collectEntries(origEl, code, sf);
				parts.push(serializeEntriesBlock(mergeEntries(original, nv), depth + 1));
			} else {
				parts.push(serializeValue(nv, depth + 1));
			}
		}
		if (wasInline && isScalarArray(newValue)) return serializeInlineArray(newValue);
		return serializeArrayParts(parts, depth, comments);
	}
	return serializeValue(newValue, depth);
}

/**
 * 在源码中把指定路径的值替换为 newValue，返回新源码。
 * 对象/数组值会与原值合并（保留键顺序、额外键、数组内部注释）。
 */
export function writePath(
	code: string,
	exportName: string,
	segments: PathSegment[],
	newValue: unknown
): string {
	const sf = parseSource(code);
	const root = findExportedObject(sf, exportName);
	if (!root) throw new Error(`未找到 export const ${exportName}`);
	const { target, lineIndent } = locateTarget(code, sf, root, segments);
	const depth = Math.max(indentDepth(lineIndent), 0);
	const replacement = serializeMerged(target, newValue, code, sf, depth);
	const start = target.getStart(sf);
	const end = target.getEnd();
	return code.slice(0, start) + replacement + code.slice(end);
}
