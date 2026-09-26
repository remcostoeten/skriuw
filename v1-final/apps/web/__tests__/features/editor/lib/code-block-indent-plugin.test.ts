import { describe, expect, test } from "bun:test";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { createCodeBlockIndentPlugin } from "@/features/editor/lib/code-block-indent-plugin";

const schema = new Schema({
	nodes: {
		doc: { content: "block+" },
		paragraph: { group: "block", content: "inline*" },
		procode: { group: "block", content: "inline*" },
		text: { group: "inline" },
	},
});

function createEditor(blockType: "procode" | "paragraph", text: string) {
	const block = schema.nodes[blockType].create(null, schema.text(text));
	const doc = schema.nodes.doc.create(null, [block]);
	let state = EditorState.create({
		doc,
		selection: TextSelection.create(doc, 1 + text.length),
	});
	const view = {
		get state() {
			return state;
		},
		dispatch(tr: Parameters<EditorView["dispatch"]>[0]) {
			state = state.apply(tr);
		},
	} as unknown as EditorView;
	return {
		view,
		text: () => state.doc.firstChild?.textContent ?? "",
		blockCount: () => state.doc.childCount,
	};
}

function keyEvent(key: string, modifiers: Partial<KeyboardEvent> = {}) {
	let prevented = false;
	const event = {
		key,
		shiftKey: false,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		...modifiers,
		preventDefault: () => {
			prevented = true;
		},
	} as unknown as KeyboardEvent;
	return { event, wasPrevented: () => prevented };
}

function pressKey(view: EditorView, key: string, modifiers: Partial<KeyboardEvent> = {}) {
	const plugin = createCodeBlockIndentPlugin();
	const { event, wasPrevented } = keyEvent(key, modifiers);
	const handled = plugin.props.handleKeyDown?.call(plugin, view, event) ?? false;
	return { handled, wasPrevented };
}

describe("code block key handling", () => {
	test("Enter inside procode inserts a newline instead of splitting the block", () => {
		const editor = createEditor("procode", "function foo() {");
		const { handled, wasPrevented } = pressKey(editor.view, "Enter");
		expect(handled).toBe(true);
		expect(wasPrevented()).toBe(true);
		expect(editor.text()).toBe("function foo() {\n");
		expect(editor.blockCount()).toBe(1);
	});

	test("Tab inside procode inserts four spaces", () => {
		const editor = createEditor("procode", "const x = 1;");
		const { handled } = pressKey(editor.view, "Tab");
		expect(handled).toBe(true);
		expect(editor.text()).toBe("const x = 1;    ");
	});

	test("Enter outside procode falls through", () => {
		const editor = createEditor("paragraph", "plain text");
		const { handled, wasPrevented } = pressKey(editor.view, "Enter");
		expect(handled).toBe(false);
		expect(wasPrevented()).toBe(false);
		expect(editor.text()).toBe("plain text");
	});

	test("modified Enter inside procode falls through so block escape keeps working", () => {
		const editor = createEditor("procode", "code");
		for (const modifiers of [{ shiftKey: true }, { metaKey: true }, { ctrlKey: true }]) {
			const { handled } = pressKey(editor.view, "Enter", modifiers);
			expect(handled).toBe(false);
		}
		expect(editor.text()).toBe("code");
	});

	test("other keys inside procode fall through", () => {
		const editor = createEditor("procode", "code");
		const { handled } = pressKey(editor.view, "a");
		expect(handled).toBe(false);
	});
});
