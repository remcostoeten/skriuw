import type { MarkdownTree, MarkdownTreeFile } from "@/features/transfer/export/markdown-transfer-model";
import { sanitizeFileName } from "@/features/transfer/export/markdown-transfer-model";
import type {
  ImportBundle,
  ImportSourceAdapter,
  ImportedNote,
  ImportedNoteProperty,
  ImportWarning,
} from "@/features/transfer/import/model";
import { noteTitleFromContent, relativeLinkBetween } from "@/features/transfer/import/model";

type KeepListItem = {
  text?: string;
  isChecked?: boolean;
};

type KeepAttachment = {
  filePath?: string;
  mimetype?: string;
};

type KeepAnnotation = {
  source?: string;
  url?: string;
  title?: string;
};

type KeepLabel = {
  name?: string;
};

type KeepNote = {
  title?: string;
  textContent?: string;
  listContent?: KeepListItem[];
  labels?: KeepLabel[];
  attachments?: KeepAttachment[];
  annotations?: KeepAnnotation[];
  color?: string;
  isTrashed?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
  createdTimestampUsec?: number;
  userEditedTimestampUsec?: number;
};

function parseKeepNote(content: string): KeepNote | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const note = parsed as KeepNote;
    const hasBody =
      typeof note.textContent === "string" || Array.isArray(note.listContent);
    return hasBody && typeof note.userEditedTimestampUsec === "number"
      ? note
      : null;
  } catch {
    return null;
  }
}

function keepFiles(tree: MarkdownTree): Array<{ file: MarkdownTreeFile; note: KeepNote }> {
  const found: Array<{ file: MarkdownTreeFile; note: KeepNote }> = [];
  for (const file of tree.files) {
    if (!/\.json$/i.test(file.relativePath)) {
      continue;
    }
    const note = parseKeepNote(file.content);
    if (note) {
      found.push({ file, note });
    }
  }
  return found;
}

function usecToMillis(value: number | undefined): number | undefined {
  return typeof value === "number" && value > 0 ? Math.floor(value / 1000) : undefined;
}

function directoryOf(relativePath: string): string {
  const cut = relativePath.lastIndexOf("/");
  return cut === -1 ? "" : relativePath.slice(0, cut);
}

function noteMarkdown(
  note: KeepNote,
  notePath: string,
  assetPaths: Set<string>,
  missingAttachments: { count: number },
): string {
  const sections: string[] = [];
  if (typeof note.textContent === "string" && note.textContent.trim().length > 0) {
    sections.push(note.textContent.replace(/\r\n/g, "\n").trim());
  }
  if (Array.isArray(note.listContent) && note.listContent.length > 0) {
    const items = note.listContent.map(
      (item) => `- [${item.isChecked ? "x" : " "}] ${(item.text ?? "").trim()}`,
    );
    sections.push(items.join("\n"));
  }
  const directory = directoryOf(notePath);
  const images: string[] = [];
  for (const attachment of note.attachments ?? []) {
    const filePath = attachment.filePath;
    if (!filePath) {
      continue;
    }
    const fullPath = directory.length > 0 ? `${directory}/${filePath}` : filePath;
    if (assetPaths.has(fullPath.toLowerCase())) {
      images.push(`![${filePath}](${relativeLinkBetween(notePath, fullPath)})`);
    } else {
      missingAttachments.count += 1;
    }
  }
  if (images.length > 0) {
    sections.push(images.join("\n"));
  }
  const links = (note.annotations ?? [])
    .filter((annotation) => annotation.source === "WEBLINK" && annotation.url)
    .map((annotation) => {
      const label = (annotation.title ?? "").trim();
      const url = annotation.url ?? "";
      return label.length > 0 ? `- [${label}](${url})` : `- <${url}>`;
    });
  if (links.length > 0) {
    sections.push(links.join("\n"));
  }
  return sections.join("\n\n");
}

function noteProperties(note: KeepNote): ImportedNoteProperty[] {
  const properties: ImportedNoteProperty[] = [];
  if (note.isPinned === true) {
    properties.push({ name: "Pinned", value: { type: "checkbox", value: true } });
  }
  if (note.isArchived === true) {
    properties.push({ name: "Archived", value: { type: "checkbox", value: true } });
  }
  if (typeof note.color === "string" && note.color.length > 0 && note.color !== "DEFAULT") {
    properties.push({ name: "Color", value: { type: "text", value: note.color } });
  }
  return properties;
}

function parse(tree: MarkdownTree): ImportBundle {
  const notes: ImportedNote[] = [];
  const warnings: ImportWarning[] = [];
  const assetPaths = new Set((tree.assets ?? []).map((path) => path.toLowerCase()));
  const missingAttachments = { count: 0 };
  const taken = new Set<string>();
  let trashed = 0;
  for (const { file, note } of keepFiles(tree)) {
    if (note.isTrashed === true) {
      trashed += 1;
      continue;
    }
    const directory = directoryOf(file.relativePath);
    const prefix = directory.length > 0 ? `${directory}/` : "";
    const markdownProbe = noteMarkdown(note, file.relativePath, assetPaths, {
      count: 0,
    });
    const title =
      (note.title ?? "").trim() || noteTitleFromContent(markdownProbe, "Untitled note");
    const baseName = sanitizeFileName(title);
    let relativePath = `${prefix}${baseName}.md`;
    let counter = 2;
    while (taken.has(relativePath.toLowerCase())) {
      relativePath = `${prefix}${baseName} (${counter}).md`;
      counter += 1;
    }
    taken.add(relativePath.toLowerCase());
    const markdown = noteMarkdown(note, relativePath, assetPaths, missingAttachments);
    const tags = (note.labels ?? [])
      .map((label) => (label.name ?? "").trim())
      .filter((name) => name.length > 0);
    const properties = noteProperties(note);
    notes.push({
      relativePath,
      title,
      markdown,
      ...(tags.length > 0 ? { tags } : {}),
      ...(properties.length > 0 ? { properties } : {}),
      createdAt: usecToMillis(note.createdTimestampUsec),
      modifiedAt: usecToMillis(note.userEditedTimestampUsec),
    });
  }
  if (trashed > 0) {
    warnings.push({
      message: `Skipped ${trashed} trashed Keep note${trashed === 1 ? "" : "s"}`,
    });
  }
  if (missingAttachments.count > 0) {
    warnings.push({
      message: `${missingAttachments.count} Keep attachment${missingAttachments.count === 1 ? "" : "s"} not found next to the export and skipped`,
    });
  }
  const notePaths = notes.map((note) => note.relativePath);
  const directories = tree.directories.filter((directory) =>
    notePaths.some((path) => path.startsWith(`${directory}/`)),
  );
  return {
    sourceId: keepSource.id,
    sourceLabel: keepSource.label,
    directories,
    notes,
    warnings,
  };
}

export const keepSource: ImportSourceAdapter = {
  id: "keep",
  label: "Google Keep",
  detect(tree) {
    return keepFiles(tree).length > 0 ? 0.95 : 0;
  },
  parse,
};
