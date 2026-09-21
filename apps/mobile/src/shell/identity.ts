type RandomSource = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
};

function webCrypto(): RandomSource | null {
  const candidate = (globalThis as { crypto?: RandomSource }).crypto;
  return candidate ?? null;
}

function uuidFromBytes(bytes: Uint8Array): string {
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * A node identifier for an optimistic create. Hermes carries no `crypto` of
 * its own, so the platform's generator is used when the runtime has one and a
 * version 4 identifier is assembled by hand when it does not.
 */
export function newNodeId(): string {
  const source = webCrypto();
  if (typeof source?.randomUUID === "function") {
    return source.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof source?.getRandomValues === "function") {
    source.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return uuidFromBytes(bytes);
}
