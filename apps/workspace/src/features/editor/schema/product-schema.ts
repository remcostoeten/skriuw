import { type NodeSpec, Schema } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { tableNodes } from "prosemirror-tables";
import { databaseViewSpec } from "./database";
import { diagramSpec } from "./diagrams";
import { blockedImageSpec, imageRefSpec } from "./images";
import { annotationSpec, highlightSpec, strikethroughSpec, underlineSpec } from "./marks";
import { mathBlockSpec, mathInlineSpec } from "./math";
import { mediaSpec } from "./media";
import { mentionRefSpec, tagRefSpec } from "./references";
import { checkItemSpec, checkListSpec } from "./tasks";
import { codeBlockSpec, headingSpec, paragraphSpec, rawMarkdownSpec } from "./text";
import { toggleItemSpec, toggleListSpec } from "./toggles";

const tableSpecs = tableNodes({
  tableGroup: "block",
  cellContent: "block+",
  cellAttributes: {},
});

/**
 * The note's annotation layer hangs off the document root rather than being a
 * block of its own: it is drawn over the whole note, including the margins
 * outside any block, and must not be movable, deletable, or reorderable as
 * content. Living in `document_json` keeps it on the existing `SaveDocument`
 * operation, history outbox, archive, backup, and sync paths. See ADR-0035.
 *
 * The payload is stored opaquely and validated on read by `parseDrawingLayer`,
 * so a layer written by a newer build survives an older build untouched.
 */
const documentSpec: NodeSpec = {
  ...(basicSchema.spec.nodes.get("doc") as NodeSpec),
  attrs: { drawing: { default: null } },
};

const nodes = addListNodes(basicSchema.spec.nodes, "paragraph block*", "block")
  .update("doc", documentSpec)
  .update("image", blockedImageSpec)
  .update("paragraph", paragraphSpec)
  .update("heading", headingSpec)
  .update("code_block", codeBlockSpec)
  .addToEnd("raw_markdown", rawMarkdownSpec)
  .addToEnd("diagram", diagramSpec)
  .addToEnd("database_view", databaseViewSpec)
  .addToEnd("check_list", checkListSpec)
  .addToEnd("check_item", checkItemSpec)
  .addToEnd("toggle_list", toggleListSpec)
  .addToEnd("toggle_item", toggleItemSpec)
  .addToEnd("tag_ref", tagRefSpec)
  .addToEnd("mention_ref", mentionRefSpec)
  .addToEnd("image_ref", imageRefSpec)
  .addToEnd("media", mediaSpec)
  .addToEnd("math_block", mathBlockSpec)
  .addToEnd("math_inline", mathInlineSpec)
  .addToEnd("table", tableSpecs.table)
  .addToEnd("table_row", tableSpecs.table_row)
  .addToEnd("table_cell", tableSpecs.table_cell)
  .addToEnd("table_header", tableSpecs.table_header);

export const productSchema = new Schema({
  nodes,
  marks: basicSchema.spec.marks
    .addToEnd("strikethrough", strikethroughSpec)
    .addToEnd("underline", underlineSpec)
    .addToEnd("highlight", highlightSpec)
    .addToEnd("annotation", annotationSpec),
});
