# Note links

## Authoring contract

The rich editor has one note-link trigger: `@`. Typing it at a text boundary opens note suggestions. The query may contain spaces so the same menu can select an existing note or create and link a new multi-word title. Enter or Tab accepts the highlighted item; Escape leaves the typed text unchanged.

Tags use `#` and people use `$`. `[[` does not open completion in the rich editor.

Every accepted note link is the existing `mention_ref` node with `kind: "note"` and a stable target ID. Renaming a target refreshes its visible label without changing the relationship. There is no second node type, suggestion index, resolver, or persistence path.

## Markdown boundary

Structured note links serialize as `[[current title]]` in raw Markdown and portable exports. Markdown paste, raw-mode parsing, archive restore, and provider import continue to recognize that bracketed representation so existing workspaces and Obsidian-style files remain compatible.

Bracketed syntax is therefore an interchange representation, not a second rich-editor authoring method. An unresolved or ambiguous imported wiki-link remains literal source text, and standard Markdown links containing brackets must not become note references.

## Relationship panel

The inspector exposes stable relationships only:

- `Backlinks` lists notes that link to the active note.
- `Links to` lists notes targeted by the active note.
- `Tags & people` lists the active note's other structured references.

Plain occurrences of another note's title are ordinary prose. They are not projected as a parallel “unlinked mentions” relationship.
