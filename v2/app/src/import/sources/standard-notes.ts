import type { MarkdownTree } from "@/export/markdown-transfer-model";
import { sanitizeFileName } from "@/export/markdown-transfer-model";
import type {
  ImportBundle,
  ImportSourceAdapter,
  ImportedNote,
  ImportWarning,
} from "@/import/model";
import { noteTitleFromContent } from "@/import/model";

type StandardNotesReference = {
  uuid?: string;
  content_type?: string;
};

type StandardNotesItem = {
  uuid?: string;
  content_type?: string;
  created_at?: string;
  updated_at?: string;
  deleted?: boolean;
  content?: {
    title?: string;
    text?: string;
    trashed?: boolean;
    protected?: boolean;
    references?: StandardNotesReference[];
    appData?: Record<string, Record<string, unknown>>;
  };
};

type StandardNotesBackup = {
  items?: StandardNotesItem[];
};

function parseBackup(content: string): StandardNotesBackup | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const backup = parsed as StandardNotesBackup;
    if (!Array.isArray(backup.items)) {
      return null;
    }
    return backup.items.some(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.content_type === "string",
    )
      ? backup
      : null;
  } catch {
    return null;
  }
}

function findBackups(tree: MarkdownTree): StandardNotesBackup[] {
  const backups: StandardNotesBackup[] = [];
  for (const file of tree.files) {
    if (!/\.(txt|json)$/i.test(file.relativePath)) {
      continue;
    }
    const backup = parseBackup(file.content);
    if (backup) {
      backups.push(backup);
    }
  }
  return backups;
}

function isoToMillis(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? undefined : millis;
}

function isEncryptedItem(item: StandardNotesItem): boolean {
  const withPayload = item as { content?: unknown; enc_item_key?: unknown };
  return (
    typeof withPayload.content === "string" ||
    typeof withPayload.enc_item_key === "string"
  );
}

function parse(tree: MarkdownTree): ImportBundle {
  const notes: ImportedNote[] = [];
  const warnings: ImportWarning[] = [];
  const tagsByNoteId = new Map<string, string[]>();
  const noteItems: StandardNotesItem[] = [];
  let trashed = 0;
  let encrypted = 0;
  for (const backup of findBackups(tree)) {
    for (const item of backup.items ?? []) {
      if (typeof item !== "object" || item === null || item.deleted === true) {
        continue;
      }
      if (isEncryptedItem(item)) {
        encrypted += 1;
        continue;
      }
      if (item.content_type === "Tag") {
        const tag = (item.content?.title ?? "").trim();
        if (tag.length === 0) {
          continue;
        }
        for (const reference of item.content?.references ?? []) {
          if (reference.content_type === "Note" && reference.uuid) {
            tagsByNoteId.set(reference.uuid, [
              ...(tagsByNoteId.get(reference.uuid) ?? []),
              tag,
            ]);
          }
        }
      } else if (item.content_type === "Note") {
        if (item.content?.trashed === true) {
          trashed += 1;
          continue;
        }
        noteItems.push(item);
      }
    }
  }
  const taken = new Set<string>();
  for (const [index, item] of noteItems.entries()) {
    const text = (item.content?.text ?? "").replace(/\r\n/g, "\n");
    const title =
      (item.content?.title ?? "").trim() ||
      noteTitleFromContent(text, `Untitled ${index + 1}`);
    const baseName = sanitizeFileName(title);
    let relativePath = `${baseName}.md`;
    let counter = 2;
    while (taken.has(relativePath.toLowerCase())) {
      relativePath = `${baseName} (${counter}).md`;
      counter += 1;
    }
    taken.add(relativePath.toLowerCase());
    const tags = item.uuid ? (tagsByNoteId.get(item.uuid) ?? []) : [];
    notes.push({
      relativePath,
      title,
      markdown: text,
      ...(tags.length > 0 ? { tags } : {}),
      createdAt: isoToMillis(item.created_at),
      modifiedAt: isoToMillis(item.updated_at),
    });
  }
  if (trashed > 0) {
    warnings.push({
      message: `Skipped ${trashed} trashed Standard Notes note${trashed === 1 ? "" : "s"}`,
    });
  }
  if (encrypted > 0) {
    warnings.push({
      message: `Skipped ${encrypted} encrypted item${encrypted === 1 ? "" : "s"}; export a decrypted backup to import them`,
      severity: "error",
    });
  }
  return {
    sourceId: standardNotesSource.id,
    sourceLabel: standardNotesSource.label,
    directories: [],
    notes,
    warnings,
  };
}

export const standardNotesSource: ImportSourceAdapter = {
  id: "standard-notes",
  label: "Standard Notes",
  detect(tree) {
    return findBackups(tree).length > 0 ? 0.95 : 0;
  },
  parse,
};
