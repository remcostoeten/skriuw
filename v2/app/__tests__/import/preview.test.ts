import assert from "node:assert/strict";
import test from "node:test";
import type { ImportBundle } from "../../src/import/model";
import type { ImportBundlePlan } from "../../src/import/plan";
import { buildImportPreviewCandidate } from "../../src/import/preview";

function bundle(): ImportBundle {
  return {
    sourceId: "fixture",
    sourceLabel: "Fixture",
    directories: ["Folder"],
    notes: [
      {
        relativePath: "Folder/Note.md",
        title: "Note",
        markdown: "![local](image.png)",
        properties: [
          { name: "Done", value: { type: "checkbox", value: true } },
        ],
      },
    ],
    warnings: [{ path: "Folder/Note.md", message: "Unsupported field" }],
  };
}

function plan(): ImportBundlePlan {
  return {
    operations: [],
    contentOperations: [
      {
        type: "save_document",
        noteId: "note-1",
        documentJson: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "image",
                  attrs: { src: "image.png", alt: "local", title: null },
                },
              ],
            },
          ],
        },
        markdown: "![local](image.png)",
        wordCount: 0,
        expectedRevision: 1,
        at: 1,
      },
    ],
    notes: [{ id: "note-1", relativePath: "Folder/Note.md" }],
    noteCount: 1,
    folderCount: 1,
    unresolvedReferences: 2,
    remoteImages: 1,
    preservedSources: 0,
    createdNotes: 1,
    updatedNotes: 0,
    duplicateTitles: 0,
    createdTags: 3,
    tagSkippedNotes: 0,
    tagPropertyNotes: 0,
    skippedTags: 0,
    skippedDuplicates: 0,
  };
}

test("preview summarizes planned entities and path-aware warnings", () => {
  const preview = buildImportPreviewCandidate(bundle(), plan(), {
    directories: ["Folder"],
    files: [],
    unsupported: ["Folder/manual.pdf"],
    skipped: 1,
  });

  assert.equal(preview.noteCount, 1);
  assert.equal(preview.folderCount, 1);
  assert.equal(preview.localImageCount, 1);
  assert.equal(preview.createdTagCount, 3);
  assert.equal(preview.propertyCount, 1);
  assert.deepEqual(preview.warningLines, [
    "2 ambiguous or unresolved wiki-links will stay as source text",
    "1 remote image will stay blocked",
    "1 unreadable file will be skipped",
    "Folder/manual.pdf: unsupported attachment will be skipped",
    "Folder/Note.md: Unsupported field",
  ]);
});

test("preview uses successful image preflight count", () => {
  const preview = buildImportPreviewCandidate(
    bundle(),
    plan(),
    { directories: [], files: [], skipped: 0 },
    0,
  );
  assert.equal(preview.localImageCount, 0);
  assert.ok(
    preview.warningLines.includes("1 unreadable image will be skipped"),
  );
});
