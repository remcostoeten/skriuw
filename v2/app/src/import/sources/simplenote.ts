import type { MarkdownTree } from "../../export/markdown-transfer-model";
import { sanitizeFileName } from "../../export/markdown-transfer-model";
import type { ImportBundle, ImportSourceAdapter, ImportedNote, ImportWarning } from "../model";
import { noteTitleFromContent } from "../model";

type SimplenoteEntry = {
  id?: string;
  content?: string;
  creationDate?: string;
  lastModified?: string;
  tags?: string[];
};

type SimplenoteExport = {
  activeNotes?: SimplenoteEntry[];
  trashedNotes?: SimplenoteEntry[];
};

function findExportFile(tree: MarkdownTree): string | null {
  const candidate = tree.files.find((file) =>
    /(^|\/)notes\.json$/i.test(file.relativePath),
  );
  return candidate?.content ?? null;
}

function parseExport(content: string): SimplenoteExport | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && "activeNotes" in parsed) {
      return parsed as SimplenoteExport;
    }
    return null;
  } catch {
    return null;
  }
}

function toMillis(iso: string | undefined): number | undefined {
  if (!iso) {
    return undefined;
  }
  const millis = Date.parse(iso);
  return Number.isNaN(millis) ? undefined : millis;
}

function parse(tree: MarkdownTree): ImportBundle {
  const warnings: ImportWarning[] = [];
  const notes: ImportedNote[] = [];
  const exportContent = findExportFile(tree);
  const data = exportContent ? parseExport(exportContent) : null;
  if (!data) {
    return {
      sourceId: simplenoteSource.id,
      sourceLabel: simplenoteSource.label,
      directories: [],
      notes,
      warnings: [{ message: "notes.json could not be parsed as a Simplenote export" }],
    };
  }
  const taken = new Set<string>();
  for (const [index, entry] of (data.activeNotes ?? []).entries()) {
    const content = entry.content ?? "";
    const title = noteTitleFromContent(content, `Untitled ${index + 1}`);
    let relativePath = `${sanitizeFileName(title)}.md`;
    let counter = 2;
    while (taken.has(relativePath.toLowerCase())) {
      relativePath = `${sanitizeFileName(title)} (${counter}).md`;
      counter += 1;
    }
    taken.add(relativePath.toLowerCase());
    notes.push({
      relativePath,
      title,
      markdown: content,
      tags: entry.tags,
      createdAt: toMillis(entry.creationDate),
      modifiedAt: toMillis(entry.lastModified),
    });
  }
  const trashed = data.trashedNotes?.length ?? 0;
  if (trashed > 0) {
    warnings.push({ message: `Skipped ${trashed} trashed Simplenote note${trashed === 1 ? "" : "s"}` });
  }
  return {
    sourceId: simplenoteSource.id,
    sourceLabel: simplenoteSource.label,
    directories: [],
    notes,
    warnings,
  };
}

export const simplenoteSource: ImportSourceAdapter = {
  id: "simplenote",
  label: "Simplenote",
  detect(tree) {
    const content = findExportFile(tree);
    return content !== null && parseExport(content) !== null ? 1 : 0;
  },
  parse,
};
