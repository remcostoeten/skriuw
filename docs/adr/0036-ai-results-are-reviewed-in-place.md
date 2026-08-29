# 0036 — AI text results are reviewed in place, not in a modal

## Status

Accepted, 2026-08-28.

## Context

An editor AI action produced a result the writer reviewed in a modal dialog: the
proposed text in a scrolling box, an accept and a discard button, and the note
itself hidden behind a scrim. The comparison the writer actually has to make —
is this better than what I wrote? — was the one thing the surface made
impossible, because the original text was not on screen next to the proposal.

Two constraints shaped the alternative. First, ADR 0033's guarantee that a
completion never touches the document until the writer accepts it: streaming
into the note and letting undo clean up would put model output into the save
path, the sync path, and the history projection for text nobody agreed to.
Second, a suggestion must not survive edits to the range it was produced from —
a rewrite of a sentence the writer has since changed is a different rewrite.

## Decision

A text result is painted over the note as decorations, never written into it.

`createSuggestionPlugin` holds at most one `SuggestionPreview` in plugin state:
the range the result would replace, and a caller-owned host element. It emits an
inline decoration over the range and a widget decoration at the block boundary
after it. Nothing enters the document, so `serializeProductMarkdown`, the save
sequencer, sync, and Git history see no difference between a note under review
and the same note untouched; discarding restores nothing because nothing was
written. Preview transactions carry `addToHistory: false` — reviewing is not an
edit, and undo must not step through it.

The proposal renders into the widget's host element through a React portal, so
the review card is ordinary product UI with the design system's buttons rather
than a second DOM vocabulary maintained inside a plugin. The host's identity is
stable for the life of the review, which is what lets ProseMirror reuse the node
across redraws instead of remounting the tree under it on every streamed token.

Any `docChanged` transaction clears the preview. Positions are deliberately not
mapped through `tr.mapping`: a mapped range would still be paintable but would
no longer be the range the model was asked about, and `applyRefusal` would
refuse the result at accept time anyway. Clearing says so immediately rather
than at the end.

The added text is word-diffed against the input with `diffWords`, moved from the
version-history module to `shared/lib/word-diff` now that two features render
it. The diff is computed only once a run settles: streamed text arrives
mid-word, and a diff recomputed per frame would show word boundaries that do not
exist yet.

Results that are not a replacement — a note title, an extracted task list, a set
of tags — have no range to diff and keep the dialog.

## Consequences

The review surface is non-modal, so the writer keeps the surrounding paragraphs,
the sidebar, and every other command available while deciding. The trade is that
a suggestion is now cancellable by typing, which is a behavior change from the
dialog: there, editing was impossible, so a result could only go stale by
navigating away.

Streaming state lives in `useAiRun`, shared by both surfaces, so the delta
buffering and stale-request rules in ADR 0033 have one implementation rather
than one per surface.
