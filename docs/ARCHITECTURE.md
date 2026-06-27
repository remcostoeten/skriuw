# Architecture

Skriuw is a notes app that ships as a Next.js web app **and** a native Tauri desktop
app from a single React codebase. The desktop build recompiles `apps/web/src` with
Vite instead of Next, so the same components, features, and domain logic run in three
runtimes: SSR web, guest browser, and native desktop.

## Monorepo layout

```
skriuw/
├─ apps/
│  ├─ web/                Next.js app (SSR + server actions). Owns ALL feature code.
│  │  ├─ src/             Shared source — the single source of truth for both builds.
│  │  └─ generated/       Prisma client output (@/generated/*).
│  └─ desktop/            Tauri 2 shell (Rust). src-tauri/ = native host + SQLite IPC.
├─ packages/
│  └─ web-spa/            Vite SPA that re-compiles apps/web/src for the desktop webview.
│     ├─ src/main.tsx     SPA entry (mounts the TanStack router).
│     ├─ src/router.tsx   Hash-routed shell over the shared feature components.
│     ├─ src/shims/       Stubs that replace Next / server-only modules at build time.
│     └─ vite.config.ts   Alias map: @ -> apps/web/src, @/generated -> apps/web/generated.
├─ prisma/                Postgres (Neon) schema + migrations.
├─ party/                 y-partyserver worker (Yjs realtime collaboration).
├─ scripts/              Repo tooling (color audit, seed, check:portable, …).
└─ wrangler.jsonc, .env  Cloudflare worker + shared environment config.
```

`apps/web/src` is never duplicated. The web build runs it through Next; the desktop
build runs the **same files** through Vite via `@` aliasing.

## Runtime selection

The SPA entry mounts `apps/web/src` feature components directly. Next routing,
`server-only` modules, and the Prisma client are replaced by shims (see boundary
below) so the shared code compiles in a plain browser/webview context.

## WorkspaceBackend seam

All data access funnels through one interface — `WorkspaceBackend` — defined at
`apps/web/src/core/workspace-backend/`. Features never talk to Prisma, IndexedDB, or
Rust directly; they call the backend resolved from context.

| Implementation | File | Storage | Used when |
|----------------|------|---------|-----------|
| `serverBackend` | `server-backend.ts` | Prisma → Postgres (Neon) via Next server actions | Web, authenticated |
| `createLocalBackend` | `local-backend.ts` | IndexedDB (React Query cache) | Web, guest (unauthenticated) |
| `createTauriBackend` | `tauri-backend.ts` | Rust / SQLite over Tauri IPC | Desktop shell |

Selection happens at runtime in `context.tsx`:

```
isTauriRuntime()            -> createTauriBackend()      (desktop, no cloud auth)
auth.phase === "authenticated" -> serverBackend          (web, signed in)
otherwise                   -> createLocalBackend(qc)     (web guest)
```

`isTauriRuntime()` checks for `window.__TAURI__.core.invoke`. The Tauri backend
marshals notes/folders to a Rust wire shape (epoch-millis timestamps, JSON
`richContent`) and back.

## The portable boundary

Code reachable from the SPA entry must run without a server. It must **not** statically
import server-only modules:

- `server-only`
- `next/headers`, `next/server`, `next/cache`
- `@/lib/prisma`, `@/lib/auth`, `@/generated/prisma/client`
- any file with a top-level `"use server"` directive

For the modules above (plus `next/navigation`, `next/link`, `next/dynamic`,
`next/image`, `next/font/google`, `next/og`, `client-only`, `node:crypto`/`crypto`,
`node:util`), the Vite config in `packages/web-spa/vite.config.ts` redirects the import
to a stub in `packages/web-spa/src/shims/`. Those specifiers are therefore **safe** in
the SPA build — Vite swaps them out.

What the shims do **not** cover are individual `"use server"` action files. A new server
action pulled into a shared component (or transitively via `server-backend.ts`) would
leak server-only code into the desktop bundle without any shim catching it.

### Lint guard: `bun run check:portable`

`scripts/check-portable.ts` enforces the boundary. It starts from the SPA entry
(`main.tsx`, `router.tsx`), follows the `@/` alias graph into `apps/web/src`
(`@/* -> apps/web/src/*`, `@/generated/* -> apps/web/generated/*`), and flags any
reachable module that:

- statically imports a forbidden specifier that is **not** in the Vite shim list, or
- contains a top-level `"use server"` directive (these are not individually shimmed).

Shimmed specifiers are skipped. Each violation prints as `file -> reason`; the script
exits non-zero if any are found, zero when clean.
