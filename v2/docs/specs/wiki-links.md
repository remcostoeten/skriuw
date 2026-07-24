# Wiki-style `[[note]]` links

Status: not started.

## Goal

Let `[[note title]]` create a reference to another note, as a second trigger syntax alongside the existing `@note-title` mention. This is a syntax addition, not a new reference system — the app already has a fully working note-reference primitive (`mention_ref` with `kind: "note"`, see `app/src/editor/schema.ts`) driven by typing `@`. Wiki-link support should reuse that primitive entirely rather than building a parallel one.

## Why this is small

`app/src/references/mention-plugin.ts` already detects trigger characters via `TRIGGER_PATTERN = /(?:^|[\s([{])([#$@])([\p{L}\p{N}_-]{0,64})$/u` and drives the same suggestion menu (`mention-menu.ts`), suggestion index (`suggestion-index.ts`), and resolver (`reference-resolver.ts`) regardless of which of `#`/`$`/`@` was typed. The entire feature is: recognize a `[[` trigger, use `]]` instead of a whitespace boundary to close it, and reuse every downstream piece unchanged.

## Trigger detection

`[[` differs from `#`/`$`/`@` in one important way: those are single-character triggers where the query runs to the cursor and the token closes implicitly (on whitespace, selection, or explicit pick). `[[note title]]` is a bracketed span with an explicit close delimiter, and the query can contain spaces and stay open across multiple words — `#`/`@`/`$` queries currently cannot (`TRIGGER_PATTERN`'s query class excludes whitespace).

Add a second regex path in `detectMention` (`app/src/references/mention-plugin.ts`) specifically for `[[`:

```ts
const WIKI_TRIGGER_PATTERN = /\[\[([^\]\n]{0,96})$/;
```

This matches an open `[[` with no closing `]]` yet, capturing everything after it up to 96 chars, no newline. Detected the same way as the existing trigger: run this against the text before the cursor; if it matches, the wiki-link menu is active with `trigger: "[["`. Extend `MentionTrigger` to `"#" | "$" | "@" | "[["`.

## Resolving to a node

Reuse `mentionMenuItems`/`queryMentionSuggestions` filtered to notes only (no tag/person group for `[[`, since wiki-link is specifically a note-linking convention — tags stay on `#`, people stay on `$`/`@`). On selection, insert the existing `mention_ref` node with `kind: "note"`, exactly as `@note` already does. Do not add a new node type to the schema.

Closing: when the user types the second `]`, close the trigger and either commit the top suggestion or leave plain bracketed text if there's no match and the user dismissed the menu (mirror however `@`/`#`/`$` currently handle "no match, user kept typing" — check `mention-plugin.ts`'s `dismissedFrom` handling before adding new state).

## Disambiguation from Markdown links

Standard Markdown link syntax (`[text](url)`, `[text][ref]`) always has a trailing `(` or `[` immediately after the closing bracket; a wiki-link never does. `WIKI_TRIGGER_PATTERN` above only fires while the bracket is still open (mid-typing), so it can't misfire on a completed `[text](url)` — by the time `]]` closes, the node is already committed as a `mention_ref` atom, not raw text that a link parser would later see. The one place this needs a real check is Markdown import (below): when parsing existing Markdown that contains `[[note]](http://example.com)`, the importer must treat that as a real link (test for the trailing `(`/`[` before treating a `[[...]]` span as a wiki-link).

## Markdown export/import

Serializer (`productMarkdownSerializer` in `app/src/editor/schema.ts`) already emits `mention_ref` nodes as `@label` or `$label` regardless of which trigger created them (the node doesn't remember its trigger, only its `kind`). Two export choices:

1. Keep exporting all note mentions as `@label`, regardless of whether they were typed via `@` or `[[`. Simplest, no serializer change, but loses the round-trip property (`[[foo]]` in → `@foo` out).
2. Export note mentions as `[[label]]` specifically (person mentions stay `$label`, tags stay `#label`), matching the wider wiki-link convention used by other note apps and making exported Markdown more portable/recognizable outside this app.

Prefer option 2 — it's what makes "wiki-style" a meaningful export format, not just an input convenience. Update `productMarkdownSerializer.nodes.mention_ref` to branch on `kind`.

Markdown import: `productMarkdownParser` needs a preprocessing or custom token rule recognizing `[[label]]` spans not immediately followed by `(`/`[` and converting them into `mention_ref` nodes at parse time, resolving `label` to an existing note by title (create-on-import semantics should match whatever `@mention`-in-pasted-Markdown already does today, if anything — check `app/src/references/extract.ts` for the current resolution behavior before adding a second path).

## Acceptance criteria

- Typing `[[` opens the same suggestion menu as `@`, scoped to notes only, and typing text after it (including spaces) filters live.
- Selecting a suggestion or typing `]]` to close with an exact unambiguous title match inserts the identical `mention_ref` atom that `@notetitle` would produce — verified by asserting the resulting document JSON is identical between the two input paths for the same target note.
- A real Markdown link `[[bracketed text]](https://example.com)` pasted or imported never becomes a note reference.
- Exported Markdown round-trips: export a note containing a `[[`-created reference, re-import that Markdown, and get back an equivalent `mention_ref` node.
- No new schema node, no new suggestion index, no new resolver — diff review should show this landing almost entirely inside `mention-plugin.ts` and the serializer/parser, not new files in `app/src/references/`.
