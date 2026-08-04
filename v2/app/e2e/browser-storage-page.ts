import {
  applyWorkspaceOperations,
  bootstrapWorkspace,
  closeWorkspaceWindow,
} from "../src/bridge/commands";

declare global {
  interface Window {
    browserStorageE2e: {
      write(): Promise<{ id: string; initialNodes: number }>;
      count(id: string): Promise<number>;
    };
  }
}

window.browserStorageE2e = {
  async write() {
    const id = `browser-opfs-${crypto.randomUUID()}`;
    const before = await bootstrapWorkspace();
    await applyWorkspaceOperations([
      {
        protocolVersion: 1,
        operation: {
          type: "create_folder",
          id,
          title: "Durable browser folder",
          placement: { parentId: null, position: { type: "last" } },
          at: Date.now(),
        },
      },
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
};
