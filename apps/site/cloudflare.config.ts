import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "skriuw-site",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-08",
    compatibilityFlags: ["nodejs_compat"],
    domains: ["skriuw.com", "www.skriuw.com", "docs.skriuw.com"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*", "!/app/assets/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      GITHUB_TOKEN: bindings.secret(),
      GITHUB_REPO: bindings.secret(),
      RA_SECRET: bindings.secret(),
    },
  }),
});
