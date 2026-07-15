import { Plugin, PluginKey, type Transaction } from "prosemirror-state";
import type { Node as PMNode, NodeType } from "prosemirror-model";
import {
	createMarkId,
	defaultColorForKind,
	detectMarks,
	inferMarkKind,
} from "@skriuw/domain/living-information";
import { isMarkDetectionEnabled } from "@/domain/notes/mark-detection";

export const autoMarkPluginKey = new PluginKey("auto-mark");

type TextRun = { text: string; offset: number };

function collectTextRuns(parent: PMNode, markType: NodeType): TextRun[] {
	const runs: TextRun[] = [];
	let current: TextRun | null = null;
	parent.forEach((child, offset) => {
		if (child.isText) {
			if (!current) current = { text: "", offset };
			current.text += child.text ?? "";
			return;
		}
		if (current) {
			runs.push(current);
			current = null;
		}
	});
	if (current) runs.push(current);
	return runs;
}

type Edit =
	| { from: number; to: number; node: PMNode }
	| { from: number; markup: Record<string, unknown> };

export function createAutoMarkPlugin(): Plugin {
	return new Plugin({
		key: autoMarkPluginKey,
		appendTransaction(transactions, oldState, newState) {
			if (transactions.some((tr) => tr.getMeta(autoMarkPluginKey))) return null;

			const docChanged = transactions.some((tr) => tr.docChanged);
			const selectionChanged = !oldState.selection.eq(newState.selection);
			if (!docChanged && !selectionChanged) return null;
			if (!isMarkDetectionEnabled()) return null;

			const markType = newState.schema.nodes.mark;
			if (!markType) return null;

			const { $from } = newState.selection;
			const parent = $from.parent;
			if (!parent.isTextblock || parent.type.spec.code) return null;

			const blockStart = $from.start();
			const caret = $from.parentOffset;
			const edits: Edit[] = [];

			for (const run of collectTextRuns(parent, markType)) {
				for (const match of detectMarks(run.text)) {
					const startOffset = run.offset + match.start;
					const endOffset = run.offset + match.end;
					if (caret >= startOffset && caret <= endOffset) continue;
					const node = markType.create({
						id: createMarkId(),
						kind: match.kind,
						text: match.text,
						value: match.text,
						color: defaultColorForKind(match.kind),
						label: "",
					});
					edits.push({
						from: blockStart + startOffset,
						to: blockStart + endOffset,
						node,
					});
				}
			}

			parent.forEach((child, offset) => {
				if (child.type !== markType) return;
				const text = String(child.attrs.text ?? "");
				const inferred = inferMarkKind(text);
				if (inferred === child.attrs.kind) return;
				const wasDefaultColor = child.attrs.color === defaultColorForKind(child.attrs.kind);
				edits.push({
					from: blockStart + offset,
					markup: {
						...child.attrs,
						kind: inferred,
						color: wasDefaultColor ? defaultColorForKind(inferred) : child.attrs.color,
					},
				});
			});

			if (edits.length === 0) return null;

			edits.sort((left, right) => right.from - left.from);
			const tr: Transaction = newState.tr;
			for (const edit of edits) {
				if ("node" in edit) {
					tr.replaceWith(edit.from, edit.to, edit.node);
				} else {
					tr.setNodeMarkup(edit.from, undefined, edit.markup);
				}
			}
			tr.setMeta(autoMarkPluginKey, true);
			return tr;
		},
	});
}
