import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

describe("resolveLocalPersistenceBackend", () => {
  const originalWarn = console.warn;
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    mock.restore();
    console.warn = originalWarn;
  });

  afterEach(async () => {
    const module = await import("../local-backend");
    module.resetLocalPersistenceBackendForTests();
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
    mock.restore();
    console.warn = originalWarn;
  });

  test("prefers PGlite when initialization succeeds", async () => {
    let openPGliteDbCalls = 0;
    const openPGliteDb = async () => {
      openPGliteDbCalls += 1;
      return undefined;
    };

    mock.module("@/core/persistence/pglite", () => ({
      openPGliteDb,
    }));

    const module = await import("../local-backend");

    await expect(module.resolveLocalPersistenceBackend()).resolves.toBe("pglite");
    await expect(module.resolveLocalPersistenceBackend()).resolves.toBe("pglite");
    expect(openPGliteDbCalls).toBe(1);
  });

  test("falls back to IndexedDB when PGlite initialization fails", async () => {
    let openPGliteDbCalls = 0;
    const openPGliteDb = async () => {
      openPGliteDbCalls += 1;
      throw new Error("boom");
    };
    let warnCalls = 0;

    mock.module("@/core/persistence/pglite", () => ({
      openPGliteDb,
    }));
    console.warn = () => {
      warnCalls += 1;
    };

    const module = await import("../local-backend");

    await expect(module.resolveLocalPersistenceBackend()).resolves.toBe("indexeddb");
    await expect(module.resolveLocalPersistenceBackend()).resolves.toBe("indexeddb");
    expect(openPGliteDbCalls).toBe(1);
    expect(warnCalls).toBe(1);
  });

  test("detects durable local persistence when Storage API reports persisted", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        storage: {
          persisted: async () => true,
          estimate: async () => ({ quota: 64 * 1024 * 1024 }),
        },
      },
      configurable: true,
    });

    const module = await import("../local-backend");

    await expect(module.detectLocalPersistenceDurability()).resolves.toBe("durable");
  });

  test("detects likely ephemeral local persistence when quota is very small", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        storage: {
          persisted: async () => false,
          estimate: async () => ({ quota: 16 * 1024 * 1024 }),
        },
      },
      configurable: true,
    });

    const module = await import("../local-backend");

    await expect(module.detectLocalPersistenceDurability()).resolves.toBe("ephemeral");
  });

  test("returns unknown durability when Storage API is unavailable", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
    });

    const module = await import("../local-backend");

    await expect(module.detectLocalPersistenceDurability()).resolves.toBe("unknown");
  });
});
