import type { ImportSourceAdapter } from "@/import/model";
import { appleNotesSource } from "./apple-notes";
import { bearSource } from "./bear";
import { evernoteSource } from "./evernote";
import { joplinSource } from "./joplin";
import { keepSource } from "./keep";
import { markdownSource } from "./markdown";
import { notionSource } from "./notion";
import { obsidianSource } from "./obsidian";
import { plainTextSource } from "./plain-text";
import { simplenoteSource } from "./simplenote";
import { standardNotesSource } from "./standard-notes";

export const importSources: readonly ImportSourceAdapter[] = [
  evernoteSource,
  joplinSource,
  keepSource,
  standardNotesSource,
  simplenoteSource,
  bearSource,
  notionSource,
  obsidianSource,
  appleNotesSource,
  plainTextSource,
  markdownSource,
];
