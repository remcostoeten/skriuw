import { defineConfig } from "@remcostoeten/dev-menu";

export default defineConfig({
  processes: [
    {
      tag: "app",
      color: "33",
      cmd: "bun",
      args: ["run", "dev"],
      cwd: "app",
      port: 5173,
      url: "http://localhost:5173",
      openKey: "a",
    },
    {
      tag: "web",
      color: "36",
      cmd: "bun",
      args: ["run", "dev"],
      cwd: "web",
      port: 5182,
      url: "http://localhost:5182",
      openKey: "w",
    },
  ],
  guardedPaths: [
    "apps/workspace/src/",
    "apps/site/src/",
    "apps/mobile/src/",
    "packages/renderer-core/src/",
  ],
});
