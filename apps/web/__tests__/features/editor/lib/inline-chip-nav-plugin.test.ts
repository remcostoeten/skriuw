import { describe, expect, test } from "bun:test";
import { Schema } from "prosemirror-model";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { createInlineChipNavPlugin } from "@/features/editor/lib/inline-chip-nav-plugin";

const schema = new Schema({
	nodes: {
		doc: { content: "block+" },
		paragraph: { group: "block", content: "inline*" },
		text: { group: "inline" },
		noteLink: {
			group: "inline",
			inline: true,
			atom: true,
			selectable: true,
			attrs: { title: { default: "" } },
		},
		person: {
			group: "inline",
			inline: true,
			atom: true,
			selectable: true,
			attrs: { id: { default: "" }, name: { default: "" } },
		},
		tag: {
			group: "inline",
			inline: true,
			atom: true,
			selectable: true,
			attrs: { name: { default: "" } },
		},
	},
});

type ChipType = "noteLink" | "person" | "tag";

function buildEditor(chipType: ChipType) {
	const chip =
		chipType === "noteLink"
			? schema.nodes.noteLink.create({ title: "Project Alpha" })
			: chipType === "person"
				? schema.nodes.person.create({ id: "person-1", name: "Ada" })
				: schema.nodes.tag.create({ name: "planning" });

	const paragraph = schema.nodes.paragraph.create(null, [
		schema.text("a"),
		chip,
		schema.text("b"),
	]);
	const doc = schema.nodes.doc.create(null, [paragraph]);
	const beforeChip = 1 + 1;
	const afterChip = beforeChip + chip.nodeSize;

	let state = EditorState.create({
		doc,
		selection: TextSelection.create(doc, afterChip),
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
		beforeChip,
		afterChip,
		setSelection(pos: number) {
			state = state.apply(state.tr.setSelection(TextSelection.create(doc, pos)));
		},
		setNodeSelection() {
			state = state.apply(state.tr.setSelection(NodeSelection.create(doc, beforeChip)));
		},
	};
}

function keyEvent(key: string) {
	let prevented = false;
	const event = {
		key,
		shiftKey: false,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		isComposing: false,
		preventDefault: () => {
			prevented = true;
		},
	} as unknown as KeyboardEvent;
	return { event, wasPrevented: () => prevented };
}

type HandlerOverrides = Partial<{
	onOpenNoteLink: (title: string) => void;
	onOpenPerson: (id: string) => void;
	onOpenTag: (name: string) => void;
}>;

function pressKey(view: EditorView, key: string, handlers: HandlerOverrides = {}) {
	const plugin = createInlineChipNavPlugin({
		onOpenNoteLink: handlers.onOpenNoteLink ?? (() => {}),
		onOpenPerson: handlers.onOpenPerson ?? (() => {}),
		onOpenTag: handlers.onOpenTag ?? (() => {}),
	});
	const { event, wasPrevented } = keyEvent(key);
	const handled = plugin.props.handleKeyDown?.call(plugin, view, event) ?? false;
	return { handled, wasPrevented };
}

describe("inline chip keyboard navigation", () => {
	test("ArrowLeft from the right of a note link lands on the chip", () => {
		const editor = buildEditor("noteLink");
		const { handled, wasPrevented } = pressKey(editor.view, "ArrowLeft");

		expect(handled).toBe(true);
		expect(wasPrevented()).toBe(true);
		expect(editor.view.state.selection).toBeInstanceOf(NodeSelection);
		expect((editor.view.state.selection as NodeSelection).node.type.name).toBe("noteLink");
	});

	test("ArrowLeft from the right of a person chip lands on the chip", () => {
		const editor = buildEditor("person");
		const { handled } = pressKey(editor.view, "ArrowLeft");

		expect(handled).toBe(true);
		expect(editor.view.state.selection).toBeInstanceOf(NodeSelection);
		expect((editor.view.state.selection as NodeSelection).node.type.name).toBe("person");
	});

	test("ArrowRight from the left of a tag chip lands on the chip", () => {
		const editor = buildEditor("tag");
		editor.setSelection(editor.beforeChip);

		const { handled } = pressKey(editor.view, "ArrowRight");

		expect(handled).toBe(true);
		expect(editor.view.state.selection).toBeInstanceOf(NodeSelection);
		expect((editor.view.state.selection as NodeSelection).node.type.name).toBe("tag");
	});

	test("Enter opens the selected chip target", () => {
		const editor = buildEditor("noteLink");
		editor.setNodeSelection();

		let openedTitle: string | null = null;
		const { handled, wasPrevented } = pressKey(editor.view, "Enter", {
			onOpenNoteLink: (title: string) => {
				openedTitle = title;
			},
		});

		expect(handled).toBe(true);
		expect(wasPrevented()).toBe(true);
		expect(openedTitle).toBe("Project Alpha");
	});

	test("Backspace from the right of a chip deletes it", () => {
		const editor = buildEditor("noteLink");
		const { handled, wasPrevented } = pressKey(editor.view, "Backspace");

		expect(handled).toBe(true);
		expect(wasPrevented()).toBe(true);
		expect(editor.view.state.doc.textContent).toBe("ab");
		expect(editor.view.state.selection.from).toBe(1 + 1);
	});

	test("Delete from the left of a chip deletes it", () => {
		const editor = buildEditor("person");
		editor.setSelection(editor.beforeChip);

		const { handled } = pressKey(editor.view, "Delete");

		expect(handled).toBe(true);
		expect(editor.view.state.doc.textContent).toBe("ab");
	});
});
