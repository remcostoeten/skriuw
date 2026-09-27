import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { resolveFromOwner } from "../../__tests__/support/resolve-from-owner.ts";

const repositoryDirectory = fileURLToPath(new URL("../..", import.meta.url));
const migrations = await readD1Migrations(fileURLToPath(new URL("./migrations", import.meta.url)));

export default defineConfig({
  plugins: [
    resolveFromOwner(repositoryDirectory),
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
    }),
  ],
  test: {
    name: "sync",
    dir: repositoryDirectory,
    include: ["__tests__/apps/sync/**/*.test.ts"],
  },
});
