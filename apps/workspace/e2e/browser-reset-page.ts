declare global {
  interface Window {
    browserResetE2e: {
      corruptDatabase(): Promise<{ file: string; size: number }>;
      workspaceFileCount(): Promise<number>;
    };
  }
}

const WORKSPACE_DIRECTORY = ".skriuw-v2";
const POOL_DIRECTORY = ".opaque";
// Every SAH-pool file opens with a 4096-byte pool header; the SQLite image
// starts after it, so garbage written here is what `open` reports as corrupt.
const POOL_HEADER_BYTES = 4096;

type PoolEntry = { name: string; handle: FileSystemFileHandle; size: number };

async function poolEntries(): Promise<PoolEntry[]> {
  const root = await navigator.storage.getDirectory();
  const workspace = await root.getDirectoryHandle(WORKSPACE_DIRECTORY);
  const pool = await workspace.getDirectoryHandle(POOL_DIRECTORY);
  const entries: PoolEntry[] = [];
  const listing = (pool as unknown as {
    entries(): AsyncIterable<[string, FileSystemHandle]>;
  }).entries();
  for await (const [name, handle] of listing) {
    if (handle.kind !== "file") {
      continue;
    }
    const file = await (handle as FileSystemFileHandle).getFile();
    entries.push({ name, handle: handle as FileSystemFileHandle, size: file.size });
  }
  return entries;
}

window.browserResetE2e = {
  async corruptDatabase() {
    const entries = await poolEntries();
    const target = entries.reduce<PoolEntry | null>(
      (largest, entry) => (largest === null || entry.size > largest.size ? entry : largest),
      null,
    );
    if (target === null || target.size <= POOL_HEADER_BYTES) {
      throw new Error(`no workspace database in the OPFS pool (${entries.length} slots)`);
    }
    // createSyncAccessHandle is worker-only, so the page writes positionally
    // and keeps the pool header intact.
    const writable = await target.handle.createWritable({ keepExistingData: true });
    await writable.write({
      type: "write",
      position: POOL_HEADER_BYTES,
      data: new Uint8Array(POOL_HEADER_BYTES).fill(0x7a),
    });
    await writable.close();
    return { file: target.name, size: target.size };
  },
  async workspaceFileCount() {
    return (await poolEntries()).length;
  },
};

export {};
