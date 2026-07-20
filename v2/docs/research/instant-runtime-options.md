# Instant runtime architecture research

## Intended product

Standalone desktop notes application first. Future browser runtime remains possible. Core MVP:

- Persistent icon rail and workspace shell.
- Nested, reorderable note/folder sidebar with context menus.
- Markdown-capable rendered editor and custom slash menu.
- Keyboard shortcuts and command palette.
- Metadata and history sidebar.
- Settings and trash.
- No journal, people, tags, sharing, authentication, or collaboration.

## Recommended eventual runtime

Desktop candidate:

- Tauri 2 shell.
- Small Vite application shell.
- React limited to chrome, or another framework only after measurement.
- Direct ProseMirror or Lexical after fixture benchmark.
- Native SQLite adapter.
- Background Git history adapter.

Browser candidate:

- Same application shell, editor, store, commands, and operation protocol.
- Dedicated worker owning SQLite WASM.
- OPFS persistence.
- Optional server replication outside interaction paths.

## Why shell framework is secondary

Post-startup latency comes mainly from asynchronous navigation dependencies, broad state invalidation, editor DOM reconstruction, and React component node views. Replacing React with another UI framework cannot remove database, IPC, parsing, or editor work.

Tauri uses native system webviews and central IPC. Electron embeds Chromium and offers more consistent rendering across operating systems at higher distribution/runtime cost. Shell choice should follow platform profiling, not bundle-size preference.

- Tauri process model: https://v2.tauri.app/concept/process-model/
- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model

## Editor candidates

### Direct ProseMirror

Strongest control candidate. One persistent `EditorView` can install cached immutable `EditorState` values. Markdown parser, serializer, input rules, plugin state, selection, and undo history are available without React node views.

- Guide: https://prosemirror.net/docs/guide/
- Markdown example: https://prosemirror.net/examples/markdown/

### Lexical

Serious benchmark challenger. Immutable serializable editor states, explicit state replacement, batched reconciliation, Markdown import/export, and shortcuts.

- State: https://lexical.dev/docs/concepts/editor-state
- Markdown: https://lexical.dev/docs/packages/lexical-markdown

### TipTap

Development-speed fallback. Mature extension layer over ProseMirror. React node views require caution; official guidance notes their synchronous mount cost. Markdown package is currently beta.

- Performance: https://tiptap.dev/docs/guides/performance
- Markdown: https://tiptap.dev/docs/editor/markdown/api/editor

### Excluded initial choices

- BlockNote: unnecessary block abstraction for reduced MVP; current application evidence shows whole-document replacement and React block costs.
- Editor.js: block JSON first; Markdown round trips require more application-specific work.
- CodeMirror: excellent raw Markdown surface, insufficient primary rendered block editor.
- Native custom editor: maximum theoretical control, excessive IME/accessibility/clipboard cost.

## Storage candidates

SQLite remains preferred. WAL, transactions, FTS5, migrations, and native/browser implementations fit requirements. Source-of-truth decision changes from Markdown files to structured SQLite documents. Markdown remains portable projection.

- WAL: https://sqlite.org/wal.html
- FTS5: https://sqlite.org/fts5.html
- Browser persistence: https://sqlite.org/wasm/doc/tip/persistence.md
- OPFS: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system

## Same-frame navigation design

Startup preloads complete supported workspace and prepares editor states. Note selection then performs only synchronous renderer operations:

1. Store current editor state.
2. Set active note ID.
3. Install cached target editor state.
4. Paint sidebar, editor, metadata, and cached history.
5. Queue last-active persistence.

No database, IPC, network, Markdown parse, Git query, route chunk, or save acknowledgment belongs here.

## Future sync

If accounts arrive, server acts as replication service. Each local transaction appends sync operations. Background workers upload and receive operations. New-device bootstrap may wait; established-device navigation remains local.

## Open decisions

- Desktop shell remains unselected until platform profile.
- UI framework remains unselected.
- ProseMirror versus Lexical requires fixture benchmark.
- Exact workspace preload ceiling requires memory profiling.
- Git library choice requires repository-operation spike.
- Sync protocol and server remain outside current scope.
