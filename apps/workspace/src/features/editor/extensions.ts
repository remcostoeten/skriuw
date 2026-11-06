import type { ComponentType } from "react";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { Plugin } from "prosemirror-state";
import type { EditorView, NodeViewConstructor } from "prosemirror-view";
import type { WorkspaceImage } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import type { NoteTarget } from "./note-target";

export type EditorNodeViews = {
  nodeViews: Record<string, NodeViewConstructor>;
  destroy?: () => void;
};

export type EditorHostProps = {
  store: RendererStore;
  selectNoteId: (state: RendererState) => string | null;
  getView: () => EditorView | null;
  getNoteId: () => string | null;
  getNoteTarget: () => NoteTarget | null;
};

export type EditorAssistantHostProps = EditorHostProps & { enabled: boolean };

export type EditorAssistant = {
  selectEnabled: (state: RendererState) => boolean;
  ask: () => void;
  Host: ComponentType<EditorAssistantHostProps>;
};

export type ImageDialog =
  | { kind: "rename"; imageId: string; image: WorkspaceImage | null; alt: string }
  | { kind: "bigger"; image: WorkspaceImage; alt: string }
  | { kind: "info"; image: WorkspaceImage; alt: string };

export type ImageDialogsProps = {
  store: RendererStore;
  dialog: ImageDialog;
  renameImage: (imageId: string, alt: string) => void;
  onClose: () => void;
};

export type EditorExtension = {
  nodeViews?: (store: RendererStore) => EditorNodeViews;
  plugins?: (store: RendererStore) => readonly Plugin[];
  activateNode?: (store: RendererStore, node: ProseMirrorNode) => boolean;
  assistant?: EditorAssistant;
  ImageDialogs?: ComponentType<ImageDialogsProps>;
};

const extensions = new Set<EditorExtension>();

/**
 * @name provideEditorExtension
 * @description Registers what a feature contributes to the note editor, so
 * the editor can render a feature's nodes, plugins, and surfaces without
 * importing that feature. The app composes extensions before the first
 * editor mounts; editors created afterwards use them.
 * @example
 * provideEditorExtension({ nodeViews: (store) => ({ nodeViews: { database_view: createDatabaseNodeView(store) } }) });
 */
export function provideEditorExtension(extension: EditorExtension): void {
  extensions.add(extension);
}

/**
 * @name providedNodeViews
 * @description Builds every registered node view for one editor's store,
 * with one teardown for all of them.
 * @example
 * const provided = providedNodeViews(store);
 * new EditorView(host, { nodeViews: { ...provided.nodeViews } });
 */
export function providedNodeViews(store: RendererStore): Required<EditorNodeViews> {
  const built = [...extensions].flatMap((extension) =>
    extension.nodeViews ? [extension.nodeViews(store)] : [],
  );
  return {
    nodeViews: Object.assign({}, ...built.map((entry) => entry.nodeViews)),
    destroy: () => {
      for (const entry of built) entry.destroy?.();
    },
  };
}

/**
 * @name providedPlugins
 * @description Builds every registered editor plugin for one editor's store.
 * @example
 * const plugins = [...providedPlugins(store), ...createProductPlugins()];
 */
export function providedPlugins(store: RendererStore): Plugin[] {
  return [...extensions].flatMap((extension) => [...(extension.plugins?.(store) ?? [])]);
}

/**
 * @name activateProvidedNode
 * @description Lets the feature that owns a selected node open it, and
 * reports whether one did.
 * @example
 * if (selection instanceof NodeSelection && activateProvidedNode(store, selection.node)) return true;
 */
export function activateProvidedNode(store: RendererStore, node: ProseMirrorNode): boolean {
  return [...extensions].some((extension) => extension.activateNode?.(store, node) === true);
}

/**
 * @name providedAssistant
 * @description Returns the registered writing assistant, if any.
 * @example
 * const assistant = providedAssistant();
 */
export function providedAssistant(): EditorAssistant | null {
  return [...extensions].findLast((extension) => extension.assistant)?.assistant ?? null;
}

/**
 * @name providedImageDialogs
 * @description Returns the registered component that renders image dialogs, if any.
 * @example
 * const ImageDialogs = providedImageDialogs();
 */
export function providedImageDialogs(): ComponentType<ImageDialogsProps> | null {
  return [...extensions].findLast((extension) => extension.ImageDialogs)?.ImageDialogs ?? null;
}
