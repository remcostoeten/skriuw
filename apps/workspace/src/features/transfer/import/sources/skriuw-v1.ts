import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { isDateKey } from "@skriuw/renderer-core/journal/dates";
import { isMoodLevel } from "@/features/journal/model";
import type { MarkdownTree } from "@/features/transfer/import/parsing/tree";
import type {
  ImportBundle,
  ImportSourceAdapter,
  ImportedJournalDay,
  ImportedNote,
} from "@/features/transfer/import/parsing/bundle";
import {
  noteTitleFromPath,
  titleFromLeadingHeading,
} from "@/features/transfer/import/parsing/bundle";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
// A key only the Skriuw v1 vault writes: notes carry `preferredEditorMode`, journal days `dateKey`.
const V1_KEY_PATTERN = /^(?:preferredEditorMode|dateKey):/m;
// v1 person mentions `$[Name](person://id)` and inline marks `[label](mark://kind/id/value)`.
const V1_INLINE_LINK_PATTERN = /\$?\[([^\]\n]*)\]\((?:person|mark):\/\/[^)\s]*\)/g;
const JOURNAL_DAY_TITLE = "Untitled";

type FrontmatterValue = string | number | string[];

type V1File = {
  fields: Map<string, FrontmatterValue>;
  body: string;
};

function isMarkdownFile(relativePath: string): boolean {
  return /\.(md|markdown)$/i.test(relativePath);
}

function isV1File(content: string): boolean {
  const block = FRONTMATTER_PATTERN.exec(content)?.[1];
  return block !== undefined && V1_KEY_PATTERN.test(block);
}

function readV1File(content: string): V1File | null {
  const match = FRONTMATTER_PATTERN.exec(content);
  if (!match || !V1_KEY_PATTERN.test(match[1] ?? "")) {
    return null;
  }
  const document = parseDocument(match[1] ?? "", { schema: "core" });
  if (document.errors.length > 0 || !isMap(document.contents)) {
    return null;
  }
  const fields = new Map<string, FrontmatterValue>();
  for (const pair of document.contents.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
      continue;
    }
    if (
      isScalar(pair.value) &&
      (typeof pair.value.value === "string" || typeof pair.value.value === "number")
    ) {
      fields.set(pair.key.value, pair.value.value);
    } else if (isSeq(pair.value)) {
      fields.set(
        pair.key.value,
        pair.value.items.flatMap((item) =>
          isScalar(item) && typeof item.value === "string" ? [item.value] : [],
        ),
      );
    }
  }
  return { fields, body: content.slice(match[0].length).replace(/^\s*\n/, "") };
}

function millisField(fields: Map<string, FrontmatterValue>, name: string): number | undefined {
  const value = fields.get(name);
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function journalDayOf(fields: Map<string, FrontmatterValue>): ImportedJournalDay | null {
  const dateKey = fields.get("dateKey");
  if (typeof dateKey !== "string" || !isDateKey(dateKey)) {
    return null;
  }
  const mood = fields.get("mood");
  return { dateKey, mood: typeof mood === "string" && isMoodLevel(mood) ? mood : null };
}

function plainV1Links(markdown: string): string {
  return markdown.replace(V1_INLINE_LINK_PATTERN, "$1");
}

function toImportedNote(relativePath: string, content: string): ImportedNote {
  const file = readV1File(content);
  if (file === null) {
    return {
      relativePath,
      ...titleFromLeadingHeading(content, noteTitleFromPath(relativePath)),
    };
  }
  const markdown = plainV1Links(file.body);
  const tags = file.fields.get("tags");
  const journalDay = journalDayOf(file.fields);
  return {
    relativePath,
    ...(journalDay
      ? { title: JOURNAL_DAY_TITLE, markdown, journalDay }
      : titleFromLeadingHeading(markdown, noteTitleFromPath(relativePath))),
    ...(Array.isArray(tags) && tags.length > 0 ? { tags } : {}),
    createdAt: millisField(file.fields, "createdAt"),
    modifiedAt: millisField(file.fields, "modifiedAt") ?? millisField(file.fields, "updatedAt"),
  };
}

function parse(tree: MarkdownTree): ImportBundle {
  return {
    sourceId: skriuwV1Source.id,
    sourceLabel: skriuwV1Source.label,
    directories: tree.directories,
    notes: tree.files
      .filter((file) => isMarkdownFile(file.relativePath))
      .map((file) => toImportedNote(file.relativePath, file.content)),
    warnings: [],
  };
}

export const skriuwV1Source: ImportSourceAdapter = {
  id: "skriuw-v1",
  label: "Skriuw v1",
  detect(tree) {
    const markdownFiles = tree.files.filter((file) => isMarkdownFile(file.relativePath));
    if (markdownFiles.length === 0) {
      return 0;
    }
    const v1Files = markdownFiles.filter((file) => isV1File(file.content)).length;
    return v1Files / markdownFiles.length >= 0.5 ? 0.9 : 0;
  },
  parse,
};
