# Editor parity

Status: active.

## Goal

Match the useful writing capabilities of the v1 editor without importing its latency, cloud coupling, or unbounded editor lifecycle. Every addition keeps the persistent direct-ProseMirror host, bounded-document fallback, zero-IPC navigation, renderer-owned canonical document, and sub-8 ms interaction contracts.

Parity is behavioral rather than implementation parity. BlockNote, Yjs, Excalidraw, AI providers, and account services do not enter v2 merely because v1 used them.

## Core formatting

The selection toolbar and keyboard commands cover:

- block type;
- bold, italic, underline, strikethrough, and inline code;
- links;
- left, center, and right block alignment;
- restrained manual highlight colors;
- headings and quotes.

Formatting must survive document JSON persistence, note switching, undo and redo, history restore, archive round trips, and HTML clipboard transfer. Markdown export must preserve representable formatting and degrade unsupported presentation deliberately rather than emitting invalid Markdown.

## Blocks

The editor supports:

- paragraphs and headings;
- bullet, ordered, check, and collapsible lists;
- quotes, dividers, and fenced code;
- images;
- tables;
- note links, tags, and people mentions.

Code blocks expose language selection and copy. Tables expose keyboard-accessible row, column, header, and delete operations. Block actions stay available from the existing drag handle and context menu.

Collapsible lists use canonical `toggle_list` and `toggle_item` nodes. The first paragraph is the always-visible summary and subsequent blocks are the disclosed content. Expanded items serialize as `- [v] summary`; collapsed items serialize as `- [>] summary`. Nested content uses ordinary Markdown list indentation, so raw mode remains readable and the open state round-trips without HTML execution. Each rendered item exposes a labelled disclosure button and the `Alt+Enter` keyboard action.

Interactive drawings, Mermaid diagrams, and file-tree visualizations require separate measured block specifications. Their stored representation, Markdown degradation, bounded-window cost, history behavior, archive behavior, accessibility fallback, and dependency cost must be accepted before implementation.

## Raw Markdown

Raw mode provides:

- optional line numbers from the existing workspace setting;
- synchronized gutter scrolling;
- current line and column;
- selected word and character counts;
- total word count;
- the existing lossless debounced save behavior.

Cursor reporting must not subscribe the shell or rich editor to keystroke state.

## Properties and tasks

The existing note-properties specification is only a storage baseline and is superseded where it limits values to untyped strings. The parity target is typed properties matching v1: text, number, date, select, multi-select, person, URL, checkbox, rating, location, email, phone, and templates. The implementation specification must be revised around a versioned property value before its domain migration begins.

Checklist-to-workspace-task synchronization and task creation from a selection are separate domain features. A document checkbox remains local document content unless the user explicitly promotes it.

## Deliberate exclusions

The following do not belong to editor parity without a separate product and architecture decision:

- AI writing, summarization, extraction, and provider settings;
- real-time collaboration, remote cursors, roles, and sharing;
- anchored cloud comments;
- mobile-only editor behavior;
- MDX execution;
- remote media hosting.

## Acceptance

- Editor typing causes no application-shell React commits.
- Formatting and block actions update the editor synchronously.
- Keyboard actions have no animation.
- No navigation-critical code is lazy-loaded after startup.
- Large notes retain full-document copy, search, undo, accessibility traversal, and bounded DOM behavior.
- Every new canonical node or mark has JSON, clipboard, Markdown, history, and archive coverage.
- `./scripts/check.sh` passes.
- Performance-sensitive changes are measured against `docs/performance-contract.md`.
