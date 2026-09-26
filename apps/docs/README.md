# Skriuw Documentation

The Fumadocs site served from `https://docs.skriuw.com`. It holds the docs for both product lines behind one version switcher.

## Local development

From the repository root:

```sh
bun install
bun run --cwd apps/docs dev
```

Open `http://localhost:6969`.

## Checks

```sh
bun run --cwd apps/docs typecheck
bun run --cwd apps/docs build
```

`build` validates every page, renders all static routes, and builds the search index. The TypeScript in this app runs through the root `oxlint` and `oxfmt` gates.

## Content

| Path | Route | What it holds |
| --- | --- | --- |
| `content/v2/` | `/v2` | User guides, features, architecture, the performance contract, and contributor references |
| `content/v2/adr/` | `/v2/adr` | Architecture decision records |
| `content/v2/specs/` | `/v2/specs` | Implementation contracts |
| `content/v2/benchmarks/` | `/v2/benchmarks` | Dated measurements. Raw samples and harness scripts are in `tools/benchmarks/` |
| `content/v1/` | `/v1` | The frozen v1 docs. Do not extend them |

Each folder marked `"root": true` in its `meta.json` becomes an entry in the version switcher. `/` redirects to `/v2`, and the old unversioned v1 URLs redirect to `/v1`.

Every page needs a `title` in its frontmatter. A `description` is optional and renders as the page's lede. Pages can be plain `.md` or `.mdx` when they need components (`Callout`, `Cards`, `Card`, `Media`). A folder's `meta.json` sets the sidebar order. The ADR, spec, and benchmark folders list their pages automatically, so new files there need no `meta.json` edit.

Link between pages with site routes such as `/v2/adr/0002-sqlite-canonical`. Link to code with a GitHub URL on `daddy`, because relative repository paths do not resolve on the site.

## Deployment

The Vercel project `skriuw-docs` builds this app with Root Directory `apps/docs` and production branch `daddy`, using the settings in `vercel.json`. No runtime environment variables are required.
