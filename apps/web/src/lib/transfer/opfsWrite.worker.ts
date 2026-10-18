interface OpfsState {
  handle: FileSystemFileHandle;
  accessHandle: {
    write: (buffer: ArrayBufferView, options?: { at?: number }) => number;
    flush: () => void;
    close: () => void;
    truncate?: (size: number) => void;
  };
  chunkSize: number;
}

const sessions = new Map<number, OpfsState>();

self.onmessage = async (event: MessageEvent) => {
  const { type, id, transferId, size, chunkSize, index, chunk } = event.data;

  try {
    switch (type) {
      case 'open': {
        const root = await navigator.storage.getDirectory();
        const fileName = `dz_${transferId}.tmp`;
        const fileHandle = await root.getFileHandle(fileName, { create: true });
        // @ts-expect-error createSyncAccessHandle exists in dedicated worker
        const accessHandle = await fileHandle.createSyncAccessHandle();
        if (size > 0 && typeof accessHandle.truncate === 'function') {
          accessHandle.truncate(size);
        }
        sessions.set(id, {
          handle: fileHandle,
          accessHandle,
          chunkSize,
        });
        self.postMessage({ type: 'opened', id });
        break;
      }

      case 'write': {
        const session = sessions.get(id);
        if (!session) throw new Error(`OPFS session ${id} not found`);
        const at = index * session.chunkSize;
        const view = new Uint8Array(chunk);
        session.accessHandle.write(view, { at });
        self.postMessage({ type: 'written', id, index });
        break;
      }

      case 'flush': {
        const session = sessions.get(id);
        if (session) {
          session.accessHandle.flush();
        }
        self.postMessage({ type: 'flushed', id });
        break;
      }

      case 'close': {
        const session = sessions.get(id);
        if (session) {
          session.accessHandle.flush();
          session.accessHandle.close();
          sessions.delete(id);
        }
        self.postMessage({ type: 'closed', id });
        break;
      }

      case 'abort': {
        const session = sessions.get(id);
        if (session) {
          try {
            session.accessHandle.close();
          } catch {
            // ignore
          }
          sessions.delete(id);
        }
        break;
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'error', id, error });
  }
};
