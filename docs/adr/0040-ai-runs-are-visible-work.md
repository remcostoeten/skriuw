# 0040 — An AI run is visible work, steered from the note

## Status

Accepted, 2026-09-09. Extends [ADR-0036](0036-ai-results-are-reviewed-in-place.md)
to every outcome and to the surface that starts a run, not only the one that
reviews its text.

## Context

ADR-0036 moved a text result out of a modal and into the note. Three things it
left alone turned out to be the rest of the same problem.

The first is reach. The only visible way into AI was a button on the selection
toolbar, so the actions that read the whole note — summarise, outline, suggest a
title, extract tasks, suggest tags — were reachable only by selecting text those
actions then ignore, or by knowing a command-palette entry existed. AI was
present exactly when it was least applicable.

The second is the surface that starts a run. Choosing an action opened a modal
picker, and picking one opened a second modal that asked the writer to press
Run. Both covered the paragraph the action was about, and the second one asked
for a confirmation that buys nothing: ADR-0033 already guarantees a completion
cannot touch the document, and ADR-0036 already puts the result in front of the
writer before it can.

The third is what a run looks like while it happens. `useAiRun` had two states a
surface could see — composing and streaming — and a stream that has opened but
produced no token is indistinguishable in both from a stream that was never
started. A cold local model can spend twenty seconds there. The note does not
change, no text arrives, and the only honest reading available to a writer is
that nothing happened. Stopping was worse: `cancel` asked the provider to stop
and waited for an acknowledgement that a failed transport never sends, so the
button could be pressed with no visible effect at all.

## Decision

**AI has a standing entry point.** `AiLauncher` renders into the editor pane
whenever the opt-in gate is open, and opens the menu on the caret when nothing
is selected. It is part of the AI host, so it is absent exactly when AI is. The
selection toolbar's entry stays and is now named rather than drawn as one more
unlabelled mark.

**The menu is anchored, not layered.** `AiMenu` is a popover over the range it
is about, sharing `rangeMenuAnchor` with the bubble and link menus so the two
swap in place. Selection actions stay listed with nothing selected, carrying the
reason they cannot run: hiding them would make the menu's contents depend on
state the writer cannot see from inside the menu.

**An action that asks the writer nothing starts on the click that chose it.**
Only the three actions with an instruction — change tone, translate, custom —
get a second step, and that step is a pane inside the same popover rather than a
second surface. The payload preview ADR-0033 requires is a disclosure in that
pane; for the actions with no instruction it is the selection itself, already on
screen and unobscured.

**A run has stages, and they are shown.** `AiActionRun` carries an `AiRunStage`
alongside its phase: `sending` while the invocation that opens the stream is in
flight, `waiting` once the provider accepted it and before any token, and
`generating` from the first delta. `aiRunSteps` turns that into three labelled
steps the card paints, so a slow run says which half of the round trip it is
slow in, and a failure marks the step it failed in rather than reddening the
whole card. A run quiet past `AI_RUN_STALL_MS` says so in words. Elapsed time
comes off a clock that only runs while a run does.

**Stopping is answered locally.** `cancel` disposes the consumer, asks the seam
to stop, and moves the run to `cancelled` itself. Waiting for a provider to
confirm a cancellation is waiting for something that may never come, and there
is nothing to be careful about: no completion has touched the document, so the
note is unchanged whether the provider heard or not. A straggling delta cannot
reopen the run because the consumer is gone before the state changes.

**Every outcome is reviewed in the note.** ADR-0036 kept the dialog for results
with no range to diff — a title, a task list, a set of tags. `AiRunCard` handles
all four outcomes in the same widget: the diff for a replacement, the plan
checklist for tasks and tags, the proposed line for a title. Only a replacement
strikes its range through, because only a replacement is going to take it.

## Consequences

There is one AI surface in the editor instead of three, and one component owning
apply-time refusal instead of two copies of it. `applyRefusal` is still asked in
exactly one place per card.

The launcher finds its pane by polling `getView()` briefly on mount rather than
having the editor push the element down as a prop. That is a deliberate trade:
one button does not justify widening the editor's interface, and the poll stops
at the first hit.

The card is now the only place a non-text result is reviewed, so a result whose
range is gone can no longer be read at all — the plugin clears the preview on
any `docChanged`, which was already true for text and is now true for tags. That
is the same rule ADR-0036 chose deliberately, applied consistently.

Stopping a run before the seam has answered means the provider may still be
generating for a moment after the card says the run is over. Nothing consumes
what it produces, and `cancel_ai_completion` is still sent.
