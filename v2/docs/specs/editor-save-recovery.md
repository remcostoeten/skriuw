# Editor save recovery

Status: implemented August 2026.

Renderer edits remain authoritative in the local editor until the matching or
a newer complete document is acknowledged as durable. A rejected save is a
note-scoped recovery state, not a successful completion:

- saves are serialized per note and remain concurrent across notes;
- failure does not strand later saves in that note's sequence;
- the editor keeps dirty content and presents an explicit retry action;
- retry reads the latest complete editor document when it starts;
- a successful matching or newer save clears the note's failure state;
- timer-triggered saves consume their rejection after recording recovery state,
  avoiding unhandled promises and automatic retry loops;
- pending-work flush rejects while any accepted editor change remains
  undurable; and
- a close request that fails or times out keeps the window open so the user can
  retry instead of silently discarding the draft.

Adapter error detail remains in local diagnostics. The product-facing recovery
copy is bounded and identifies the affected note through the editor surface
without exposing storage internals.
