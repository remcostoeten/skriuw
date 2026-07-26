export const WORKSPACE_PROTOCOL_VERSION = 1;

export type NodeKind = "note" | "folder";

export type WorkspaceNode = {
  id: string;
  kind: NodeKind;
  parentId: string | null;
  rank: number;
  title: string;
  icon: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  pinnedAt: number | null;
};

export type WorkspaceDocument = {
  noteId: string;
  documentJson: unknown;
  markdown: string;
  revision: number;
  wordCount: number;
};

export type HistoryHeader = {
  noteId: string;
  versionId: string;
  createdAt: number;
  summary: string;
};

export type WorkspaceSettings = {
  settingsVersion: number;
  theme: string;
  compactSidebar: boolean;
  showPageIcons: boolean;
  reduceMotion: boolean;
  rememberLastNote: boolean;
  editorFont: string;
  editorLineHeight: string;
  showLineNumbers: boolean;
  editorPlaceholder: string;
} & Record<string, unknown>;

export type WorkspaceImage = {
  id: string;
  noteId: string;
  contentHash: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  createdAt: number;
};

export type NotePropertyColor =
  | "gray"
  | "stone"
  | "amber"
  | "green"
  | "blue"
  | "teal"
  | "rose"
  | "red";

export type NotePropertyOption = {
  id: string;
  label: string;
  color: NotePropertyColor;
};

type VersionedPropertyValue = { valueVersion: 1 };

export type NotePropertyValue = VersionedPropertyValue &
  (
    | { type: "text"; value: string }
    | { type: "number"; value: number | null }
    | { type: "date"; value: string }
    | { type: "select"; value: string | null }
    | { type: "multi-select"; value: string[] }
    | { type: "person"; value: string[] }
    | { type: "url"; value: string }
    | { type: "checkbox"; value: boolean }
    | { type: "rating"; value: number | null }
    | { type: "location"; value: string }
    | { type: "email"; value: string }
    | { type: "phone"; value: string }
  );

export type NotePropertyField = {
  id: string;
  name: string;
  value: NotePropertyValue;
  options: NotePropertyOption[];
  position: number;
};

export type NoteProperty = NotePropertyField & {
  noteId: string;
};

export type NotePropertyTemplate = {
  id: string;
  name: string;
  position: number;
  properties: NotePropertyField[];
};

export type WorkspaceSnapshot = {
  protocolVersion: number;
  activeNoteId: string | null;
  nodes: WorkspaceNode[];
  documents: WorkspaceDocument[];
  historyHeaders: HistoryHeader[];
  settings: WorkspaceSettings;
  tags: {
    id: string;
    name: string;
    color: string | null;
    createdAt: number;
    updatedAt: number;
    createdIn: string | null;
  }[];
  people: {
    id: string;
    name: string;
    initials: string | null;
    color: string | null;
    note: string | null;
    createdAt: number;
    updatedAt: number;
    createdIn: string | null;
  }[];
  references: { noteId: string; targets: { kind: "tag" | "person" | "note"; targetId: string }[] }[];
  images?: WorkspaceImage[];
  properties?: NoteProperty[];
  propertyTemplates?: NotePropertyTemplate[];
};

export type NodePosition =
  | { type: "first" }
  | { type: "last" }
  | { type: "before"; anchorId: string }
  | { type: "after"; anchorId: string };

export type NodePlacement = {
  parentId: string | null;
  position: NodePosition;
};

export type WorkspaceOperation =
  | {
      type: "create_tag";
      tag: {
        id: string;
        name: string;
        color: string | null;
        createdAt: number;
        updatedAt: number;
        createdIn: string | null;
      };
    }
  | { type: "rename_tag"; id: string; name: string }
  | { type: "recolor_tag"; id: string; color: string | null }
  | { type: "delete_tag"; id: string }
  | {
      type: "create_person";
      person: {
        id: string;
        name: string;
        initials: string | null;
        color: string | null;
        note: string | null;
        createdAt: number;
        updatedAt: number;
        createdIn: string | null;
      };
    }
  | { type: "rename_person"; id: string; name: string }
  | { type: "recolor_person"; id: string; color: string | null }
  | { type: "delete_person"; id: string }
  | {
      type: "create_folder";
      id: string;
      title: string;
      placement: NodePlacement;
      at: number;
    }
  | {
      type: "create_note";
      id: string;
      title: string;
      placement: NodePlacement;
      documentJson: unknown;
      markdown: string;
      at: number;
    }
  | { type: "rename_node"; id: string; title: string; at: number }
  | { type: "move_node"; id: string; placement: NodePlacement; at: number }
  | { type: "set_node_pinned"; id: string; pinned: boolean; at: number }
  | {
      type: "save_document";
      noteId: string;
      documentJson: unknown;
      markdown: string;
      wordCount: number;
      expectedRevision: number;
      at: number;
    }
  | { type: "trash_subtree"; rootId: string; at: number }
  | {
      type: "restore_subtree";
      rootId: string;
      placement: NodePlacement;
      at: number;
    }
  | { type: "purge_subtree"; rootId: string; trashedBefore: number }
  | { type: "set_active_note"; noteId: string | null }
  | { type: "update_settings"; settings: WorkspaceSettings }
  | { type: "attach_image"; image: WorkspaceImage }
  | { type: "set_note_property"; property: NoteProperty; at: number }
  | { type: "remove_note_property"; noteId: string; propertyId: string; at: number }
  | {
      type: "reorder_note_properties";
      noteId: string;
      orderedPropertyIds: string[];
      at: number;
    }
  | { type: "set_note_property_template"; template: NotePropertyTemplate }
  | { type: "delete_note_property_template"; templateId: string }
  | { type: "reorder_note_property_templates"; orderedTemplateIds: string[] };

export type WorkspaceOperationEnvelope = {
  protocolVersion: number;
  operation: WorkspaceOperation;
};

export function envelope(operation: WorkspaceOperation): WorkspaceOperationEnvelope {
  return { protocolVersion: WORKSPACE_PROTOCOL_VERSION, operation };
}

export type EntityRevision = {
  id: string;
  revision: number;
};

export type NodeRankChange = {
  id: string;
  parentId: string | null;
  rank: number;
};

export type OperationAck = {
  applied: number;
  revisions: EntityRevision[];
  rankChanges: NodeRankChange[];
};

export type SearchHit = {
  noteId: string;
  title: string;
  snippet: string;
  score: number;
};
