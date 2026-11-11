# ADR-0062: The on-screen keyboard sends keystrokes to the focused editor

- Status: accepted
- Date: 2026-11-11

## Context

People who cannot use a physical keyboard, or who work on a tablet or with a
pointer or eye tracker, need a way to type into the note. The workspace has two
editors, ProseMirror for rendered notes and CodeMirror for raw Markdown, plus
ordinary inputs such as the title and search fields. Each has its own keymaps,
input rules and Vim layer. Typing by writing text into a document model would
bypass all of them, and a store action per key would put the renderer store on
the keystroke path that the [performance contract](../performance-contract.md)
keeps free of the application shell.

## Decision

The on-screen keyboard is a dock in the shell (`features/on-screen-keyboard`)
that turns each press into a keystroke and delivers it to the focused editable
the way hardware would:

1. It dispatches a `keydown` on the editor element with `key`, `code`,
   `keyCode` and the latched modifiers. Editor keymaps, input rules, Vim
   motions and the app's own shortcuts handle it exactly as they handle a real
   key.
2. If nothing called `preventDefault`, it applies the browser default for that
   key: `execCommand("insertText")`, `delete`, `forwardDelete` and
   `insertParagraph` and `Selection.modify` for a contenteditable, and range
   edits for inputs and textareas.
3. It dispatches the matching `keyup`.

Pointer presses never take focus from the editor. The dock remembers the last
focused editable and falls back to the open note's editor. A press made from
the keyboard briefly focuses the editor and then returns focus to the key.

Shift, Control, Alt and Super apply to the next key only. Caps Lock, Num Lock
and Scroll Lock stay until pressed again; Num Lock off turns the numpad into
navigation keys and Scroll Lock scrolls the editor pane instead of moving the
caret. The dock is a plain component with its own state. It does not subscribe
to the renderer store, and its open state and options are device settings kept
in local storage.

Motor accessibility options live in the dock: dwell click, activation on
release, and a key size choice. Each key is a button with a spoken name, one
tab stop moves between keys with the arrow keys, and latch changes are
announced.

## Consequences

- Typing through the dock reaches the editors through the same paths as a
  physical keyboard, so there is no second input pipeline to keep in step.
- `execCommand` is deprecated but remains the only way to feed text to a
  contenteditable through the editor's own input handling. If a browser drops
  it, inserted text stops working and the dock needs a `beforeinput` based
  path.
- `Selection.modify` is non-standard, so caret movement for keys the editor
  does not bind depends on engine support. Chromium and WebKit provide it.
- The dock toggles with `mod+alt+k` or from the command palette. Some Linux
  desktops claim `mod+alt+k`, so it can be rebound.
- The dock is not offered on the compact (phone-width) shell. The command is
  hidden and disabled there and the dock does not render, so the system
  keyboard and the dock never compete on a phone. A tablet in the full layout
  still gets the system keyboard when an editor takes focus.
