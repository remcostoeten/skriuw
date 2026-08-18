# AI editor actions

The implementation contract for the selection and whole-note AI actions that put
model output next to canonical documents. It sits under ADR-0033 and reconciles
the v1-parity AI actions plan against the code that actually shipped in the AI
platform milestone.

## Scope

Selection actions live in the note editor's bubble menu and in the command
palette. Whole-note actions live in the palette only. Every action is a run
through the one provider seam; none of them is a second completion path.

## Actions are data

`app/src/features/ai/editor-actions.ts` holds the catalogue. An action names a
built-in prompt id and never carries prompt text, so the shipped wording lives
in `skriuw_domain::prompt::BUILT_IN_PROMPTS` and reaches the renderer through
the generated `contracts/generated/built-in-prompts.json`. A user-customised
copy of a built-in shadows it through `promptLibraryEntries`, so editing
"Rewrite" in settings changes what the bubble menu sends.

| Action | Prompt | Scope | Outcome |
| --- | --- | --- | --- |
| Rewrite | `rewrite` | selection | text |
| Improve writing | `improve` | selection | text |
| Fix spelling and grammar | `fix-grammar` | selection | text |
| Make shorter | `shorten` | selection | text |
| Make longer | `lengthen` | selection | text |
| Simplify | `simplify` | selection | text |
| Change tone | `change-tone` | selection | text |
| Translate | `translate` | selection | text |
| Custom instruction | `custom` | selection | text |
| Continue writing | `continue` | caret | text |
| Summarize note | `summarize` | note | text |
| Outline note | `outline` | note | text |
| Suggest a title | `title` | note | title |
| Extract tasks | `extract-tasks` | note | tasks |
| Suggest tags | `suggest-tags` | note | tags |

`extract-tasks` and `suggest-tags` were added to the shipped library for this
feature, taking `BUILT_IN_PROMPT_LIBRARY_VERSION` to 2. Both ask for one item
per line so their output can be read as a plan rather than parsed as prose.

Scope decides the payload. `selection` sends the highlighted text, `caret` sends
the note up to the cursor — continuing writing must not be handed the text it is
supposed to be writing towards — and `note` sends the note's Markdown.

## The opt-in gate

Nothing here exists while AI is off. The palette commands come from
`aiEditorActionCommands`, which returns the shared empty array through
`guardAiRegistrations`. The bubble menu's AI button is absent because
`onAskAi` is null. The host that owns every AI surface mounts inside
`AiOptInGate` and is behind a lazy import, so with AI off no picker, preview
buffer, model lookup, or completion module is loaded at all.

A palette request made while the host chunk is still arriving is queued and
replayed once. Turning AI off drops the queue, so an opt-out followed by an
opt-in cannot replay a stale action.

With a split open both panes register a listener, and the request goes to the
pane holding the caret. When focus sits outside both — in the palette, say — the
most recently mounted pane answers.

Nothing in this path runs on startup, typing, save, navigation, or palette
open. `remote_ai_providers` is never read here: whether a provider is remote is
decided from its id, so no surface prompts the OS keyring.

## Disclosure before anything leaves the device

The compose step shows the resolved model and the exact user prompt that will be
sent, character for character — `aiActionUserPrompt` is the same function the
request builder uses, so the preview cannot drift from the payload. A non-local
provider is named together with the fact that the text leaves the device.

Consent itself is enforced at the seam (ADR-0033): a remote request without
current consent terminates as a typed provider error, which the surface reports
with its recovery action. The renderer does not keep a second consent model.

## Bounds

| Bound | Value | Source |
| --- | --- | --- |
| Input bytes | 128 KiB | `MAX_AI_ACTION_INPUT_BYTES` |
| Instruction bytes | 500 | `MAX_AI_ACTION_INSTRUCTION_BYTES` |
| Output bytes | the prompt's own `maxOutputBytes` | built-in prompt library |
| Duration | 60 s | `AI_ACTION_TIMEOUT_MS` |
| Retries | 0 | `AI_ACTION_RETRY_COUNT` |
| Plan items | 50 | `MAX_PLAN_ITEMS` |
| Task title bytes | 500 | `MAX_TASK_TITLE_BYTES` |
| Tag name bytes | 64 | `MAX_TAG_NAME_BYTES` |

Nothing is trimmed to fit. An oversized selection is refused with its measured
size and the limit, because half a selection produces output that looks complete
and is not. An over-long plan is refused for the same reason. Bounds are counted
in bytes, matching what the seam enforces.

## Preview buffer, one transaction, byte-for-byte cancel

Deltas accumulate in `AiActionRun.preview` and are painted from a single
animation frame. The canonical document is never a stream target, so cancelling,
timing out, failing, or discarding leaves the note exactly as it was — there is
nothing to roll back because nothing was written.

Accepting is one editor transaction, so one undo restores the note:

- **Replace** — `replaceRangeTransaction` over the captured range.
- **Insert below** — `insertBelowTransaction` after the block holding the range's
  end.
- **Rename note** (title) — the ordinary `rename_node` operation.

A result may also be copied, retried, or discarded. Retrying always fires a new
request id; ADR-0033 forbids retrying a stream that already produced output, and
that rule lives at the seam.

Markdown in a result becomes real blocks through the same
`markdownPasteSlice` the editor uses for pasted Markdown; anything that is not
Markdown is inserted as literal paragraphs.

## Reviewable plans

`extract-tasks` and `suggest-tags` never apply themselves. Their output is
parsed into a plan of deduplicated, individually tickable items. Output that is
not a list is refused rather than guessed at, so a confirmed plan cannot contain
a sentence of commentary posing as a task.

On confirmation the plan is applied through the ordinary domain operations:

- Tasks append a `check_list` of `check_item` nodes carrying fresh task and block
  identities from `taskCheckItemAttrs`, after which the note's normal promotion
  path owns them. An extracted task is the same object as a hand-typed one.
- Tags reuse an existing tag by name when there is one and otherwise submit a
  `create_tag` reference operation, then append ordinary `tag_ref` chips.

## Late results and stale ranges

Every run captures its note id, document range, and input text before anything
is sent. Applying re-reads that range from the live editor and refuses when the
note changed, the writer navigated away, or the range no longer fits the
document — `applyRefusal` returns the reason, so a stale result explains itself
instead of silently doing nothing or overwriting the wrong text.

The renderer-side consumer keys on request id and rejects out-of-order
sequences, and the run reducer ignores deltas and terminals belonging to a
superseded request. A deliberately late fake-provider result therefore cannot
reach a live buffer.

## Accessibility

- Every surface is a shared `Dialog`, so focus trapping, Escape, and top-layer
  stacking come from the platform. Content that acts on the page as it closes
  goes through `useDialogClose`, since everything outside an open modal is inert.
- The picker is a combobox over a listbox using `useListboxNavigation`, which
  provides `shift+arrow` as the jump-to-end alias for the 60% keyboards this is
  built for. The bubble menu's roving toolbar focus gained the same alias.
- Streaming progress is announced through one `role="status" aria-live="polite"`
  line per surface, naming the action and its state; refusals and provider
  errors are `role="alert"`.
- Every control is a real button reachable by plain Tab. The bubble menu's AI
  button is icon-only and carries both `title` and `aria-label`.
- Applying returns focus to the editor.

## Run recording

Each action passes its own origin — `editor:<action id>` — to
`startAiCompletion`, so run history distinguishes a rewrite from a translation
without inspecting prompts. Recording itself happens at the seam; see
`docs/specs/ai-run-history.md`.

## Verification

`app/__tests__/features/ai/` covers the catalogue and its prompt references,
input and instruction bounds, plan parsing, the palette command gate and request
queue, the ProseMirror transactions, and — driven through the shipped completion
consumer — streaming, cancellation, timeout, malformed output, malformed plans,
superseded requests, and late results after navigation.
