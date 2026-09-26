# Skriuw Documentation

Production Fumadocs site for [Skriuw](https://skriuw.com), served from `https://docs.skriuw.com`.

## Local development

From repository root:

```sh
bun install
bun run --cwd apps/documentation dev
```

Open `http://localhost:3000`. Use a different port if `apps/web` is running.

```sh
bun run --cwd apps/documentation dev -- --port 3001
```

## Checks

```sh
bun run --cwd apps/documentation lint
bun run --cwd apps/documentation typecheck
bun run --cwd apps/documentation build
```

`build` validates MDX, renders all static documentation routes, generates the search source, and checks production compilation.

## Content

Docs live in `content/docs`. Every page needs frontmatter with a unique `title` and `description`. Folder-level `meta.json` files define sidebar grouping and order. Keep links root-relative, for example `/reference/shortcuts`, so they remain valid on `docs.skriuw.com`.

`docs/` is source archive for existing project documentation. Migrated production copies live under this application. Update both only when archival source must remain current.

## SEO

`lib/site.ts` owns production domain. Page metadata includes canonical URLs, OpenGraph, Twitter, and `TechArticle` JSON-LD. `app/sitemap.ts` enumerates public Fumadocs pages. `app/robots.ts` allows crawling and points bots to sitemap. Do not add `noindex` unless page must be private.

## Deployment

Create a Vercel project connected to this repository:

1. Set Root Directory to `apps/documentation`.
2. Keep configuration from `apps/documentation/vercel.json`.
3. Add `docs.skriuw.com` as production domain, then create its DNS record in domain provider.
4. Set production branch to `daddy`.

No runtime environment variables are required. Vercel creates preview deployments for pull requests and production deployments from `daddy`. Its ignored-build rule redeploys only when documentation, migrated source, workspace dependencies, or lockfile change.
