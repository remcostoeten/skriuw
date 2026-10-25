import type { NodeViewConstructor } from "prosemirror-view";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

export type BlockViewFactory = (store: RendererStore) => NodeViewConstructor;

const blockViews = new Map<string, BlockViewFactory>();

/**
 * @name provideBlockView
 * @description Registers the node view a feature renders for one of the
 * editor's block types, so the editor can show a feature's UI without
 * importing that feature. Editors created afterwards use it.
 * @example
 * provideBlockView("database_view", createDatabaseNodeView);
 */
export function provideBlockView(nodeName: string, factory: BlockViewFactory): void {
  blockViews.set(nodeName, factory);
}

/**
 * @name providedBlockViews
 * @description Builds every registered block node view for one editor's store.
 * @example
 * new EditorView(host, { nodeViews: { ...providedBlockViews(store) } });
 */
export function providedBlockViews(store: RendererStore): Record<string, NodeViewConstructor> {
  return Object.fromEntries([...blockViews].map(([name, factory]) => [name, factory(store)]));
}
