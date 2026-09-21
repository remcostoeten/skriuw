import type { MarkdownTree } from "@/features/transfer/export/markdown-transfer-model";
import { sanitizeFileName } from "@/features/transfer/export/markdown-transfer-model";
import type {
  ImportBundle,
  ImportSourceAdapter,
  ImportedNote,
  ImportWarning,
} from "@/features/transfer/import/model";
import { relativeLinkBetween } from "@/features/transfer/import/model";

const RAW_ITEM_FILE = /(^|\/)([0-9a-f]{32})\.md$/i;
const METADATA_LINE = /^[a-z0-9_]+:( |$)/;
const RESOURCE_LINK = /(!?)\[([^\]\n]*)\]\(:\/([0-9a-f]{32})\)/gi;

const ITEM_TYPE_NOTE = "1";
const ITEM_TYPE_FOLDER = "2";
const ITEM_TYPE_RESOURCE = "4";
const ITEM_TYPE_TAG = "5";
const ITEM_TYPE_NOTE_TAG = "6";

type JoplinItem = {
  relativePath: string;
  title: string;
  body: string;
  metadata: Map<string, string>;
};

function parseItem(relativePath: string, content: string): JoplinItem | null {
  const lines = content.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  let metadataStart = lines.length;
  while (metadataStart > 0 && METADATA_LINE.test(lines[metadataStart - 1] ?? "")) {
    metadataStart -= 1;
  }
  const metadata = new Map<string, string>();
  for (const line of lines.slice(metadataStart)) {
    const cut = line.indexOf(":");
    if (cut > 0) {
      metadata.set(line.slice(0, cut), line.slice(cut + 1).trim());
    }
  }
  if (!metadata.has("id") || !metadata.has("type_")) {
    return null;
  }
  const title = (lines[0] ?? "").trim();
  const body = lines
    .slice(1, metadataStart)
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
  return { relativePath, title, body, metadata };
}

function collectItems(tree: MarkdownTree): JoplinItem[] {
  const items: JoplinItem[] = [];
  for (const file of tree.files) {
    if (!RAW_ITEM_FILE.test(file.relativePath)) {
      continue;
    }
    const item = parseItem(file.relativePath, file.content);
    if (item) {
      items.push(item);
    }
  }
  return items;
}

function isoToMillis(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? undefined : millis;
}

function folderPath(
  folderId: string,
  folders: Map<string, { title: string; parentId: string }>,
): string {
  const segments: string[] = [];
  const seen = new Set<string>();
  let current = folderId;
  while (current.length > 0 && !seen.has(current)) {
    seen.add(current);
    const folder = folders.get(current);
    if (!folder) {
      break;
    }
    segments.unshift(sanitizeFileName(folder.title || "Untitled folder"));
    current = folder.parentId;
  }
  return segments.join("/");
}

function buildResourceIndex(tree: MarkdownTree): Map<string, string> {
  const index = new Map<string, string>();
  for (const asset of tree.assets ?? []) {
    const baseName = asset.slice(asset.lastIndexOf("/") + 1);
    const id = baseName.replace(/\.[^.]+$/, "").toLowerCase();
    if (/^[0-9a-f]{32}$/.test(id) && !index.has(id)) {
      index.set(id, asset);
    }
  }
  return index;
}

function rewriteResourceLinks(
  body: string,
  notePath: string,
  resources: Map<string, string>,
  resourceTitles: Map<string, string>,
  missing: { count: number },
): string {
  return body.replace(RESOURCE_LINK, (_whole, bang: string, label: string, id: string) => {
    const asset = resources.get(id.toLowerCase());
    if (asset !== undefined) {
      const text = label.trim() || resourceTitles.get(id.toLowerCase()) || "attachment";
      return `${bang}[${text}](${relativeLinkBetween(notePath, asset)})`;
    }
    missing.count += 1;
    const text = label.trim() || resourceTitles.get(id.toLowerCase()) || "";
    return text.length > 0 ? `${text} (attachment)` : "(attachment)";
  });
}

function parse(tree: MarkdownTree): ImportBundle {
  const items = collectItems(tree);
  const warnings: ImportWarning[] = [];
  const folders = new Map<string, { title: string; parentId: string }>();
  const tagTitles = new Map<string, string>();
  const noteTags = new Map<string, string[]>();
  const resourceTitles = new Map<string, string>();
  const noteItems: JoplinItem[] = [];
  let deleted = 0;
  for (const item of items) {
    const type = item.metadata.get("type_") ?? "";
    const id = (item.metadata.get("id") ?? "").toLowerCase();
    if (type === ITEM_TYPE_FOLDER) {
      folders.set(id, {
        title: item.title,
        parentId: (item.metadata.get("parent_id") ?? "").toLowerCase(),
      });
    } else if (type === ITEM_TYPE_TAG) {
      tagTitles.set(id, item.title);
    } else if (type === ITEM_TYPE_NOTE_TAG) {
      const noteId = (item.metadata.get("note_id") ?? "").toLowerCase();
      const tagId = (item.metadata.get("tag_id") ?? "").toLowerCase();
      noteTags.set(noteId, [...(noteTags.get(noteId) ?? []), tagId]);
    } else if (type === ITEM_TYPE_RESOURCE) {
      resourceTitles.set(id, item.title);
    } else if (type === ITEM_TYPE_NOTE) {
      const deletedTime = item.metadata.get("deleted_time") ?? "";
      if (deletedTime.length > 0 && deletedTime !== "0") {
        deleted += 1;
        continue;
      }
      noteItems.push(item);
    }
  }
  const resources = buildResourceIndex(tree);
  const missing = { count: 0 };
  const notes: ImportedNote[] = [];
  const taken = new Set<string>();
  const usedDirectories = new Set<string>();
  for (const item of noteItems) {
    const id = (item.metadata.get("id") ?? "").toLowerCase();
    const parentId = (item.metadata.get("parent_id") ?? "").toLowerCase();
    const directory = folderPath(parentId, folders);
    if (directory.length > 0) {
      const segments = directory.split("/");
      for (let index = 1; index <= segments.length; index += 1) {
        usedDirectories.add(segments.slice(0, index).join("/"));
      }
    }
    const title = item.title || "Untitled note";
    const prefix = directory.length > 0 ? `${directory}/` : "";
    const baseName = sanitizeFileName(title);
    let relativePath = `${prefix}${baseName}.md`;
    let counter = 2;
    while (taken.has(relativePath.toLowerCase())) {
      relativePath = `${prefix}${baseName} (${counter}).md`;
      counter += 1;
    }
    taken.add(relativePath.toLowerCase());
    const markdown = rewriteResourceLinks(
      item.body,
      relativePath,
      resources,
      resourceTitles,
      missing,
    );
    const tags = (noteTags.get(id) ?? [])
      .map((tagId) => tagTitles.get(tagId) ?? "")
      .filter((tag) => tag.length > 0);
    notes.push({
      relativePath,
      title,
      markdown,
      ...(tags.length > 0 ? { tags } : {}),
      createdAt: isoToMillis(item.metadata.get("created_time")),
      modifiedAt: isoToMillis(item.metadata.get("updated_time")),
    });
  }
  if (deleted > 0) {
    warnings.push({
      message: `Skipped ${deleted} deleted Joplin note${deleted === 1 ? "" : "s"}`,
    });
  }
  if (missing.count > 0) {
    warnings.push({
      message: `${missing.count} Joplin attachment${missing.count === 1 ? "" : "s"} had no readable file under resources/ and became text`,
    });
  }
  return {
    sourceId: joplinSource.id,
    sourceLabel: joplinSource.label,
    directories: [...usedDirectories].sort(),
    notes,
    warnings,
  };
}

export const joplinSource: ImportSourceAdapter = {
  id: "joplin",
  label: "Joplin",
  detect(tree) {
    return collectItems(tree).some((item) => {
      const type = item.metadata.get("type_");
      return type === ITEM_TYPE_NOTE || type === ITEM_TYPE_FOLDER;
    })
      ? 0.95
      : 0;
  },
  parse,
};
