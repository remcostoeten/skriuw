---
name: next-skeletons
description: >
  Visual QA for Next.js skeleton/loading states via next-playwright instant() API.
  Trigger on: skeleton testing, loading state QA, CLS with skeletons, Suspense
  fallback testing, fallback shell verification, or next-playwright usage.
---

# Skeleton QA — Agent-Driven Feedback Loop for Next.js Loading States

This skill sets up an automated feedback loop where you:

1. Run a Playwright test that captures skeleton and loaded states
2. Read the structured text output to understand what's wrong
3. Fix the relevant Suspense fallback shells (these can live anywhere — `loading.tsx`, inline `<Suspense fallback={...}>`, cache component wrappers, etc.)
4. Re-run the test until all routes pass

## How It Works

Next.js's `@next/playwright` package exports an `instant()` function that holds back
dynamic data streams, showing only the skeleton/loading UI deterministically. The test
captures both states, compares bounding boxes and pixel diffs, and prints actionable
results to stdout.

## Prerequisites

The project must have:
- Next.js 15+ with App Router
- Playwright installed (`npx playwright install`)
- Routes that use Suspense boundaries (via `loading.tsx`, inline `<Suspense>`, or any other pattern)

## Setup

### 1. Install dependencies

```bash
npm install --save-dev @next/playwright @playwright/test pixelmatch pngjs
```

### 2. Create the test file

Copy `test-template.ts` to the project's e2e directory (e.g. `e2e/skeleton-qa.spec.ts`).

### 3. Configure routes

Create `skeleton-qa.config.ts` at the project root:

```typescript
export default {
  routes: ['/', '/products', '/products/[slug]', '/cart', '/account'],
  clsThreshold: 2,       // px — shifts below this are ignored
  diffThreshold: 0.05,   // 5% pixel diff threshold
  viewports: [
    { width: 1280, height: 720, name: 'desktop' },
    { width: 375, height: 812, name: 'mobile' },
  ],
  landmarks: ['nav', 'main', '[role="complementary"]', 'footer'],
  settleTime: 1000,
}
```

## The Feedback Loop

### Step 1: Run the test

```bash
npx playwright test e2e/skeleton-qa.spec.ts
```

### Step 2: Read the output

The test prints structured results to stdout. Example:

```
--- FAIL [desktop] /products ---
Pixel diff: 18.3% (threshold: 5.0%)
CLS violations: 2
  SHIFT: main moved (0px, 45px), size delta (0px, 600px)
    Fix: Skeleton height for main is off by 600px. Add min-height or aspect-ratio to the skeleton container to reserve space.
  SHIFT: footer moved (0px, 580px), size delta (0px, 0px)
    Fix: footer shifts 580px vertically. An element above it likely changes size — check skeleton heights of preceding elements.


--- PASS [desktop] /cart ---
Pixel diff: 2.1% (threshold: 5.0%)
CLS violations: 0
  No issues.
```

Each failing route includes:
- **Which elements shifted** and by how much
- **A suggested fix** explaining what to change and where

### Step 3: Fix the fallback shells

Based on the output, find and edit the relevant Suspense fallback. These can be
`loading.tsx` files, inline `<Suspense fallback={...}>` wrappers, cache component
shells, or any other fallback pattern. Common structural fixes:

- **Large vertical shift** — The skeleton doesn't reserve enough height. Add `min-height` or `aspect-ratio` to the skeleton container.
- **Element missing from skeleton** — The loaded page has an element (e.g. sidebar) that the fallback omits. Add it to the fallback shell.
- **Horizontal shift** — The fallback doesn't mirror the loaded layout's grid/flex structure.
- **High pixel diff but no CLS** — The fallback structure differs from the loaded layout even though landmarks didn't shift.

Read `cls-analysis.md` for a deeper dive on CLS patterns and fixes with code examples.

### Step 4: Re-run and repeat

```bash
npx playwright test e2e/skeleton-qa.spec.ts
```

Continue until all routes pass. A passing route has zero CLS violations and pixel diff
below threshold (default 5%).

## Generating a Combined Report

After running the tests, you can generate a combined text report across all routes:

```bash
npx tsx generate-report.ts
```

This reads all `report.json` files from `test-results/skeleton-qa/` and prints a
summary to stdout. It also writes `combined-report.json` for programmatic use.

## Reference Files

- `test-template.ts` — Full annotated Playwright test template (copy this to your project)
- `cls-analysis.md` — Deep dive on CLS measurement methodology and fix patterns
- `generate-report.ts` — Script to generate a combined text report from test artifacts
