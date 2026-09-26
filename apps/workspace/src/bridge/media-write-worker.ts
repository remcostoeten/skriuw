/**
 * Writes one media blob into OPFS through a synchronous access handle. Older
 * iOS Safari has no `FileSystemFileHandle.createWritable`, and sync access
 * handles exist only inside workers.
 */
type WriteRequest = { directory: string; fileName: string; buffer: ArrayBuffer };
type SyncAccessHandle = {
  truncate(size: number): void;
  write(data: Uint8Array, options: { at: number }): number;
  flush(): void;
  close(): void;
};
type SyncCapableHandle = FileSystemFileHandle & {
  createSyncAccessHandle(): Promise<SyncAccessHandle>;
};
type WriteReply = { ok: true } | { ok: false; message: string };

self.onmessage = async (event: MessageEvent<WriteRequest>) => {
  const { directory, fileName, buffer } = event.data;
  let reply: WriteReply = { ok: true };
  try {
    const root = await navigator.storage.getDirectory();
    const blobs = await root.getDirectoryHandle(directory, { create: true });
    const handle = (await blobs.getFileHandle(fileName, { create: true })) as SyncCapableHandle;
    const access = await handle.createSyncAccessHandle();
    try {
      access.truncate(0);
      access.write(new Uint8Array(buffer), { at: 0 });
      access.flush();
    } finally {
      access.close();
    }
  } catch (error) {
    reply = {
      ok: false,
      message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
  self.postMessage(reply);
};
