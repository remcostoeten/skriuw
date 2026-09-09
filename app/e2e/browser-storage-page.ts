import { lastSavedTextFile, rememberPickedFile } from "../src/bridge/browser-files";
import {
  applyWorkspaceOperations,
  bootstrapWorkspace,
  closeWorkspaceWindow,
  exportWorkspaceArchive,
  importWorkspaceArchive,
  rebuildSearchIndex,
  searchIndexStatus,
  searchWorkspace,
} from "../src/bridge/commands";
import type { WorkspaceOperationEnvelope } from "../src/contracts/workspace";

declare global {
  interface Window {
    browserStorageE2e: {
      write(): Promise<{ id: string; initialNodes: number }>;
      count(id: string): Promise<number>;
      archiveRoundTrip(): Promise<{ markerCopies: number; extraCopies: number }>;
      invalidArchiveRejected(): Promise<{ code: string; nodesAfter: number }>;
      contentSearch(): Promise<{
        hits: number;
        snippet: string;
        diacriticHits: number;
        opaqueHits: number;
        rebuiltHits: number;
        needsRebuildAfter: boolean;
      }>;
    };
  }
}

function createNoteOperation(
  id: string,
  title: string,
  markdown: string,
): WorkspaceOperationEnvelope {
  return {
    protocolVersion: 1,
    operation: {
      type: "create_note",
      id,
      title,
      placement: { parentId: null, position: { type: "last" } },
      documentJson: { type: "doc", content: [] },
      markdown,
      at: Date.now(),
    },
  };
}

function createFolderOperation(id: string, title: string): WorkspaceOperationEnvelope {
  return {
    protocolVersion: 1,
    operation: {
      type: "create_folder",
      id,
      title,
      placement: { parentId: null, position: { type: "last" } },
      at: Date.now(),
    },
  };
}

window.browserStorageE2e = {
  async write() {
    const id = `browser-opfs-${crypto.randomUUID()}`;
    const before = await bootstrapWorkspace();
    await applyWorkspaceOperations([
      createFolderOperation(id, "Durable browser folder"),
    ]);
    const written = await bootstrapWorkspace();
    if (!written.nodes.some((node) => node.id === id)) {
      throw new Error("accepted browser write was not visible before reopen");
    }
    await closeWorkspaceWindow();
    return { id, initialNodes: before.nodes.length };
  },
  async count(id) {
    const snapshot = await bootstrapWorkspace();
    return snapshot.nodes.filter((node) => node.id === id).length;
  },
  async archiveRoundTrip() {
    const markerId = `archive-marker-${crypto.randomUUID()}`;
    const extraId = `post-export-${crypto.randomUUID()}`;
    await bootstrapWorkspace();
    await applyWorkspaceOperations([
      createFolderOperation(markerId, "Archive round-trip marker"),
    ]);
    const report = await exportWorkspaceArchive();
    const saved = lastSavedTextFile();
    if (!saved || saved.fileName !== report.fileName) {
      throw new Error("archive export did not hand a download to the browser");
    }
    await applyWorkspaceOperations([
      createFolderOperation(extraId, "Created after export"),
    ]);
    const pickedPath = rememberPickedFile(saved.fileName, saved.text);
    const imported = await importWorkspaceArchive(pickedPath);
    const snapshot = imported.snapshot;
    return {
      markerCopies: snapshot.nodes.filter((node) => node.id === markerId).length,
      extraCopies: snapshot.nodes.filter((node) => node.id === extraId).length,
    };
  },
  /**
   * FTS5 has to be compiled into the browser SQLite build, not only the
   * desktop one, or content search silently returns nothing on the web.
   */
  async contentSearch() {
    const id = `browser-search-${crypto.randomUUID()}`;
    await bootstrapWorkspace();
    await applyWorkspaceOperations([
      createNoteOperation(
        id,
        "Reisverslag",
        'Het geërfde café lag naast een oud terras.\n\n```drawing\n{"strokes":[{"pressure":12}]}\n```',
      ),
    ]);
    const hits = await searchWorkspace("terras", 10, [id]);
    const diacritic = await searchWorkspace("cafe", 10, [id]);
    const opaque = await searchWorkspace("pressure", 10, [id]);
    await rebuildSearchIndex();
    const rebuilt = await searchWorkspace("terras", 10, [id]);
    const status = await rebuildSearchIndex();
    return {
      hits: hits.length,
      snippet: hits[0]?.snippet ?? "",
      diacriticHits: diacritic.length,
      opaqueHits: opaque.length,
      rebuiltHits: rebuilt.length,
      needsRebuildAfter: (await searchIndexStatus()).needsRebuild || status.needsRebuild,
    };
  },
  async invalidArchiveRejected() {
    const pickedPath = rememberPickedFile("not-an-archive.json", '{"hello":"world"}');
    let code = "none";
    try {
      await importWorkspaceArchive(pickedPath);
    } catch (error) {
      code = (error as { code?: string }).code ?? "unknown";
    }
    const snapshot = await bootstrapWorkspace();
    return { code, nodesAfter: snapshot.nodes.length };
  },
};
