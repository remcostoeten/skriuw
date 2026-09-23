import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { resolveFromOwner } from "../../__tests__/support/resolve-from-owner.ts";

const repositoryDirectory = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [
    resolveFromOwner(repositoryDirectory),
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    name: "sync",
    dir: repositoryDirectory,
    include: ["__tests__/services/sync/**/*.test.ts"],
  },
});
