# Agent skills for Skriuw

This folder holds Cursor agent skills synced via `skills-lock.json`. Use this guide to pick the right skill for work in this repo.

## App stack (quick reference)

| Area         | Stack                                                       |
| ------------ | ----------------------------------------------------------- |
| Framework    | Next.js 16 App Router, React 19, Turbopack, Bun             |
| Auth         | Better Auth + Prisma adapter (`src/lib/auth.ts`)            |
| Database     | PostgreSQL + Prisma 7 (`prisma/schema.prisma`)              |
| Client state | Zustand, TanStack Query                                     |
| Editor       | BlockNote                                                   |
| AI           | Vercel AI SDK (`ai`, Google/Groq providers)                 |
| Shortcuts    | `@remcostoeten/use-shortcut` (`src/core/shortcuts/`)        |
| UI           | shadcn/Radix, Tailwind 4, Framer Motion                     |
| Testing      | Bun unit tests, Playwright + `@next/playwright` skeleton QA |

## Skill tiers

### Use often

| Skill                               | When to use it                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `use-shortcut`                      | Command palette, scoped shortcuts, binding storage, shortcut registry changes            |
| `better-auth-best-practices`        | Sessions, plugins, env vars, auth route handler, Prisma auth schema                      |
| `email-and-password-best-practices` | Email verification, password reset, credential security (verification is deferred today) |
| `next-best-practices`               | App Router conventions, RSC boundaries, async server APIs, `proxy.ts`                    |
| `vercel-react-best-practices`       | Performance, waterfalls, bundle size, re-renders, server actions auth                    |
| `vercel-composition-patterns`       | Sidebar, settings, layout shells — avoid boolean prop sprawl                             |
| `prisma-database-setup`             | Schema, migrations, client setup, provider changes, Bun CLI usage                        |
| `next-skeletons`                    | Loading shells, Suspense fallbacks, `test:skeleton`, CLS QA                              |
| `emilkowal-animations`              | Sidebar motion, transitions, drawers, toasts, easing/timing polish                       |
| `improve-codebase-architecture`     | Refactors in `src/domain/`, deepening modules, finding seams                             |

### Use sometimes

| Skill                                      | When to use it                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `supabase-postgres-best-practices`         | Postgres query/index tuning via Prisma — ignore Supabase platform/RLS specifics |
| `create-auth-skill`                        | Greenfield auth scaffolding; less needed now that auth exists                   |
| `two-factor-authentication-best-practices` | Adding MFA with Better Auth `twoFactor` plugin                                  |

## Gaps (no skill in `.agents` yet)

These are important in Skriuw but not covered by local skills:

- Vercel AI SDK / streaming / provider keys (`src/domain/ai/`)
- BlockNote editor customization (`src/features/editor/`)
- Note sharing and crypto (`src/domain/sharing/`)
- TanStack Query patterns (Vercel skills reference SWR, not React Query)

## Domain map

Prefer matching skills to the area you touch:

```
src/domain/notes/      → prisma, react-best-practices, composition-patterns
src/domain/sharing/    → better-auth (public routes), architecture
src/domain/journal/    → react-best-practices, emilkowal-animations
src/domain/ai/         → (no local skill — use AI SDK docs)
src/core/shortcuts/    → use-shortcut
src/lib/auth.ts        → better-auth-best-practices, email-and-password-best-practices
src/features/layout/   → next-skeletons, emilkowal-animations
```

## Updating skills

Skills are pinned in `skills-lock.json` at the repo root. Re-sync from upstream sources when upgrading skill packages; do not edit skill content here unless intentionally forking a skill (e.g. `use-shortcut`).

Removed from this repo (not relevant to Skriuw): `supabase`, `mobile-touch`, `organization-best-practices`.
