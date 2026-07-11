---
title: "AI Feature Follow-ups - Agent Handoff"
description: "**Status (2026-07-03):** Tasks 2, 3, 4 **and 5** are implemented and verified (src-clean tsc, biome, cargo check, bun tests). Task 5: streaming re-parse"
---

> **Status (2026-07-03):** Tasks 2, 3, 4 **and 5** are implemented and verified (src-clean tsc, biome, cargo check, bun tests). Task 5: streaming re-parse throttled (150ms trailing in `beginStreamingContinue`), journal spellCheck Revert/Keep banner added (`JournalSpellCheckRevertBanner`, state in `use-journal-ai`), and translate target language is now a preference (`ai.translateLanguage`, Settings → AI picker, `{translateDirective}` in prompts.json, sanitized on both web and Rust; "auto" keeps EN↔NL heuristic). Task 1's server-side paths were verified live against Groq via `curl` (blocking, streamed, and translate with/without targetLanguage); the **in-browser editor flows** (stream-into-editor rendering, mid-stream edit cancellation, bubble-toolbar selection actions, suggestTags banner, usage-log token counts in Settings) still need a manual pass. `suggestTags`/`generateTitle` were deliberately not wired into the journal (entries are date-titled; tags are structured entry metadata, not a `Tags: #…` line).

Execution plan for the remaining AI work. The base expansion (11 actions, selection AI, streaming, banners) is **already implemented and verified** (tsc, biome, cargo check, unit tests) in the working tree on branch `daddy` - do NOT redo it. This document covers what is left.

## Context - what already exists

The AI feature was expanded from 3 to 11 actions across web and desktop:

| Scope          | Actions                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Whole document | `generateTitle`, `spellCheck`, `continueWriting`, `summarize`, `extractTasks`, `suggestTags`    |
| Selection      | `fixSelection`, `rewriteSelection`, `shortenSelection`, `expandSelection`, `translateSelection` |

Key files (all already modified - read them before changing anything):

- `apps/web/src/domain/ai/types.ts` - `AiAction` / `AiSelectionAction` unions.
- `apps/web/src/domain/ai/constants.ts` - `ACTION_MODEL_DEFAULTS`, `AI_SELECTION_ACTIONS`.
- `apps/web/src/app/api/ai/route.ts` - `PROMPTS` map (all 11), `STREAMABLE_ACTIONS`, streaming branch (`stream: true` → `streamText().toTextStreamResponse()`, usage logged in `onFinish`).
- `apps/desktop/src-tauri/src/ai/mod.rs` - `prompt_for` with the same 11 prompts (duplicated on purpose; a comment marks the sync requirement).
- `apps/web/src/features/ai/service.ts` - `AiEditorHandle` (optional `getSelectionText`, `replaceSelection`, `appendMarkdown`, `beginStreamingContinue`), `callAi`, `callAiStream`, `tailForContinuation` (continueWriting sends only last ~4k chars).
- `apps/web/src/features/ai/hooks/use-ai-action.ts` - shared runner; `contentSource` per-action content override; streaming path for `continueWriting` when not Tauri and the handle provides `beginStreamingContinue`.
- `apps/web/src/features/editor/components/rich-text-editor.tsx` - handle implementation, bubble-toolbar `AiMenu` (`SELECTION_AI_ITEMS`), slash-menu AI items.
- `apps/web/src/features/editor/components/editor-container.tsx` - `NOTE_AI_ACTIONS`, `applyAiResult`, spellCheck Revert/Keep banner, `SuggestedTagsBanner`, `aiNotice` banner.
- `apps/web/src/features/editor/components/editor-toolbar.tsx` - sparkle dropdown with all doc-level actions, `aiLoading` is now `Partial<Record<AiAction, boolean>>`.

Conventions that MUST be followed (from the user's global style rules):

- Standalone functions are `function` declarations; callbacks are arrow functions.
- No empty `catch` - use `noop()` from `@/shared/lib/noop` to swallow intentionally.
- No explanatory comments; comments only for workarounds/constraints the code can't express.
- Tabs for indentation, matching the surrounding files.

Verification commands:

```sh
bunx tsc --noEmit -p apps/web          # ignore pre-existing __tests__/ errors; src must be clean
bunx biome check <changed files>
cd apps/desktop/src-tauri && cargo check
cd apps/web && bun test __tests__/features/ai __tests__/domain
```

---

## Task 1 - Live verification of the streaming path (do this first)

The streaming `continueWriting` path was verified by typecheck and unit tests only, never at runtime.

1. Start the web app (`bun dev` from repo root or `apps/web`), sign in, open a note in **block** editor mode.
2. Write a paragraph that ends mid-sentence, then trigger Continue writing from the toolbar sparkle dropdown.
3. Verify: text streams into the editor incrementally (not one blob), the final paragraph is merged (not duplicated above new text), the diff highlight appears when done, and one `ai_usage` row is logged with token counts (check Settings → AI usage log; token counts must be non-null - that also validates the `readUsageMetadata` v6 fix).
4. Verify a mid-stream user edit of the streamed blocks stops further updates instead of fighting the user.
5. Also smoke-test one selection action (select text → bubble toolbar → AI → Rewrite) and `suggestTags` (banner appears, chips toggle, "Add to note" appends a `Tags: #…` line).
6. Fix whatever breaks. Likely weak spots: `markdownToRichDocument` output for partial markdown chunks, and selection range invalidation in `replaceSelection`.

## Task 2 - Wire the new actions into the journal

The journal still only exposes `spellCheck` and `continueWriting`.

- `apps/web/src/features/journal/hooks/use-journal-ai.ts` - extend `JournalAiAction` with the 5 selection actions and `summarize`/`extractTasks` (skip `generateTitle` and `suggestTags`; journal entries have no title or tag line convention - confirm by reading `journal-editor.tsx` before deciding on `suggestTags`). Add `contentSource` entries for selection actions (`handle.getSelectionText?.() ?? ""`) and `applyResult` entries mirroring `editor-container.tsx` (`replaceSelection` for selection actions, `appendMarkdown` for summarize/tasks).
- `apps/web/src/features/journal/components/journal-editor.tsx` - pass `onAiAction={(action) => aiState.runAiAction(action)}` to the `RichTextEditor` (rich mode only; the plain-text editor has no handle support).
- The journal's error/rate-limit banners live in `journal-ai-banners.tsx` - they consume the generic controller, so they should work unchanged; verify.

## Task 3 - Desktop streaming for continueWriting

Web streams; desktop `ai_complete` is blocking. Port streaming to Tauri:

- `apps/desktop/src-tauri/src/ai/ollama.rs` and `cloud.rs` - Ollama (`"stream": true` NDJSON), Groq (OpenAI-style SSE), and Gemini (`streamGenerateContent`) all support streaming. Add streaming variants.
- Emit chunks via a Tauri event channel (e.g. `app.emit("ai:stream", …)` with a request id) or use Tauri 2 `Channel<String>` as a command argument - prefer `Channel`, it's the idiomatic Tauri 2 way.
- New command `ai_complete_stream(action, content, channel)`; keep `ai_complete` for the other actions.
- Web side: in `use-ai-action.ts`, the Tauri branch currently never streams (`!isTauriRuntime()` guard). Extend `callAiStream`-equivalent for Tauri or add a `tauriInvokeStream` helper in `service.ts` that bridges the Channel to the same `onText(accumulated)` callback. The `beginStreamingContinue` applier is platform-agnostic and needs no changes.
- Register the new command in the invoke handler (`mod.rs` / `lib.rs` - find `ai_complete` registration).

## Task 4 - Single-source the prompts

Prompts are duplicated in TypeScript (`route.ts`) and Rust (`mod.rs`) and have already diverged once historically.

Preferred approach: a build-time generated artifact.

1. Create `packages/ai-prompts/prompts.json` (or `apps/web/src/domain/ai/prompts.json`): `{ action: { system, user_template } }` with `{content}` placeholder, plus the two shared rule strings.
2. Web: load the JSON in `route.ts` (static import), interpolate `content`. The web path currently has no system message - keep concatenating system + user into the single `prompt`, or switch to `system:`/`prompt:` params of `generateText`/`streamText` (better; do that).
3. Rust: `include_str!` the same JSON relative path and parse with `serde_json` at startup (or lazy_static/OnceLock). Replace `prompt_for`'s hardcoded strings with lookups; keep the `Err` for unknown actions.
4. Delete the "keep in sync" comments once both sides read the same file. Add a small web unit test asserting every `AiAction` has a prompt entry.

Watch out: the desktop build packages from `apps/desktop/src-tauri` - verify `include_str!("../../../web/src/domain/ai/prompts.json")` (or wherever) resolves in both dev and CI builds before committing to a location.

## Task 5 - Optional polish (only if time permits)

- Throttle the streaming re-parse in `beginStreamingContinue` (currently re-parses every chunk; fine for short outputs, wasteful for long ones - ~150ms trailing throttle).
- Revert banner for journal spellCheck (notes have it, journal does not).
- `translateSelection` target language could come from a preference instead of the hardcoded EN↔NL heuristic (`usePreferencesStore` ai slice, plus prompt change in BOTH prompt sources).

## Definition of done

- All verification commands pass (src-clean tsc, biome, cargo check, bun tests).
- Task 1 manual flows confirmed working in a real browser session.
- No regression to the existing 3 original actions on either platform.
- Prompts exist in exactly one source of truth (after Task 4).
