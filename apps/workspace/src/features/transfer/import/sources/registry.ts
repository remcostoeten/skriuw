import type { ImportSourceAdapter } from "@/features/transfer/import/parsing/bundle";
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
import { skriuwV1Source } from "./skriuw-v1";
import { standardNotesSource } from "./standard-notes";

export const importSources: readonly ImportSourceAdapter[] = [
  skriuwV1Source,
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
