# next-skeletons

A Claude Code skill for visual QA of Next.js loading states. It uses `next-playwright`'s `instant()` API to deterministically capture skeleton/loading UI and compare it against the fully loaded page, catching CLS and layout mismatches.

## What it does

- Screenshots the skeleton state (via `instant()`) and the loaded state for each route
- Compares bounding boxes of landmark elements to detect layout shift
- Generates pixel diffs to flag structural mismatches
- Outputs an actionable report with annotated diffs

## Install

```bash
npx skills add blurrah/next-skeletons-skill
```
