import { afterEach, beforeEach, describe, expect, test } from "bun:test";

describe("detectLocalPersistenceDurability", () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
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

    const module = await import("@/core/persistence/repositories/local-backend");

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

    const module = await import("@/core/persistence/repositories/local-backend");

    await expect(module.detectLocalPersistenceDurability()).resolves.toBe("ephemeral");
  });

  test("returns unknown durability when Storage API is unavailable", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
    });

    const module = await import("@/core/persistence/repositories/local-backend");

    await expect(module.detectLocalPersistenceDurability()).resolves.toBe("unknown");
  });
});
