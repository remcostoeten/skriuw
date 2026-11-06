import { InputRule } from "prosemirror-inputrules";
import type { MarkType } from "prosemirror-model";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { createDefaultDiagram } from "../diagrams/model";
import { productSchema } from "./product-schema";

/**
 * Converts inline markdown delimiters into a mark as the closing delimiter is
 * typed (e.g. `**bold**`). `match[1]` must capture the marked content and the
 * match must end with the closing delimiter; anything before the opening
 * delimiter is left untouched.
 */
export function markInputRule(
  pattern: RegExp,
  markType: MarkType,
  delimiterLength: number,
): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const content = match[1] ?? "";
    if (!content) return null;
    if (state.doc.resolve(start).parent.type.spec.code) return null;
    const prefix = match[0].length - content.length - delimiterLength * 2;
    const openStart = start + prefix;
    const contentStart = openStart + delimiterLength;
    const contentEnd = contentStart + content.length;
    const codeMark = productSchema.marks.code;
    if (
      codeMark &&
      markType !== codeMark &&
      state.doc.rangeHasMark(contentStart, Math.min(contentEnd, end), codeMark)
    ) {
      return null;
    }
    const tr = state.tr;
    if (contentEnd < end) tr.delete(contentEnd, end);
    tr.delete(openStart, contentStart);
    tr.addMark(openStart, openStart + content.length, markType.create());
    tr.removeStoredMark(markType);
    return tr;
  });
}

export function horizontalRuleInputRule(): InputRule {
  return new InputRule(/^(?:---|—-|___|\*\*\*)$/, (state, _match, start, end) => {
    const horizontalRule = productSchema.nodes.horizontal_rule;
    const paragraph = productSchema.nodes.paragraph;
    if (!horizontalRule || !paragraph) return null;
    const tr = state.tr.replaceRangeWith(start, end, horizontalRule.create());
    const afterRule = tr.mapping.map(end);
    if (!tr.doc.resolve(afterRule).nodeAfter) {
      tr.insert(afterRule, paragraph.create());
    }
    tr.setSelection(TextSelection.near(tr.doc.resolve(afterRule), 1));
    return tr.scrollIntoView();
  });
}

export function diagramInputRule(): InputRule {
  return new InputRule(/^```(?:mermaid|diagram)\s$/i, (state, _match, start, end) => {
    const diagram = productSchema.nodes.diagram;
    if (!diagram || state.doc.resolve(start).parent.type.spec.code) return null;
    const inserted = diagram.create({ model: createDefaultDiagram() });
    const tr = state.tr.replaceRangeWith(start, end, inserted);
    let position: number | null = null;
    tr.doc.descendants((candidate, pos) => {
      if (candidate !== inserted) return position === null;
      position = pos;
      return false;
    });
    if (position !== null) tr.setSelection(NodeSelection.create(tr.doc, position));
    return tr.scrollIntoView();
  });
}
