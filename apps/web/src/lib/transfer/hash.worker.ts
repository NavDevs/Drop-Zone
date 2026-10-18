import { createSHA256 } from 'hash-wasm';

interface HashContext {
  hasher: Awaited<ReturnType<typeof createSHA256>>;
}

const instances = new Map<number, HashContext>();

self.onmessage = async (event: MessageEvent) => {
  const { type, id, chunk } = event.data;

  try {
    switch (type) {
      case 'init': {
        const hasher = await createSHA256();
        hasher.init();
        instances.set(id, { hasher });
        self.postMessage({ type: 'ready', id });
        break;
      }

      case 'update': {
        const ctx = instances.get(id);
        if (ctx && chunk) {
          ctx.hasher.update(new Uint8Array(chunk));
        }
        self.postMessage({ type: 'updated', id });
        break;
      }

      case 'digest': {
        const ctx = instances.get(id);
        if (!ctx) {
          throw new Error(`Hash instance ${id} not found`);
        }
        const hex = ctx.hasher.digest();
        instances.delete(id);
        self.postMessage({ type: 'digest', id, hex });
        break;
      }

      case 'abort': {
        instances.delete(id);
        break;
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'error', id, error });
  }
};
