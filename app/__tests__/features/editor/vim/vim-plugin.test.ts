import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, Selection, TextSelection, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  createProductPlugins,
  parseProductMarkdown,
  serializeProductMarkdown,
} from "../../../../src/features/editor/schema";
import {
  createVimPlugin,
  resetVimSharedState,
  vimModeOf,
  type VimHost,
} from "../../../../src/features/editor/vim/vim-plugin";
import { resetRegisters } from "../../../../src/features/editor/vim/vim-registers";
import { wrappedLayout } from "./wrapped-layout";

type Harness = {
  view: EditorView;
  press(keys: string): void;
  type(text: string): void;
  markdown(): string;
  mode(): string;
  cursor(): number;
  textAtCursor(): string;
  host: VimHost;
  calls: string[];
};

/** Markdown as the product serializer writes it, so expectations survive list and line-break formatting. */
function md(markdown: string): string {
  return serializeProductMarkdown(parseProductMarkdown(markdown));
}

function createHarness(markdown: string, cursorText?: string, enabled = true): Harness {
  resetRegisters();
  resetVimSharedState();
  const calls: string[] = [];
  const host: VimHost = {
    enabled: () => enabled,
    noteKey: () => "note",
    undo: () => false,
    redo: () => false,
    write: () => {
      calls.push("write");
    },
    quit: () => {
      calls.push("quit");
    },
    jumpToLine: (line) => {
      calls.push(`jump:${line}`);
    },
    documentEdge: () => false,
    windowStep: (direction) => {
      calls.push(`window:${direction}`);
      return false;
    },
    scrollContainer: () => null,
    clipboard: { write: () => undefined, read: async () => "" },
  };
  const plugin = createVimPlugin(host);
  let state = EditorState.create({
    doc: parseProductMarkdown(markdown),
    plugins: [plugin, ...createProductPlugins()],
  });
  if (cursorText) {
    let found = -1;
    state.doc.descendants((node, pos) => {
      if (found !== -1) return false;
      if (node.isText && node.text) {
        const at = node.text.indexOf(cursorText);
        if (at !== -1) found = pos + at;
      }
      return true;
    });
    assert.notEqual(found, -1, `cursor text ${cursorText} not found`);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, found)));
  } else {
    state = state.apply(state.tr.setSelection(Selection.atStart(state.doc)));
  }
  const view = {
    get state() {
      return state;
    },
    dispatch(transaction: Transaction) {
      state = state.apply(transaction);
    },
    focus() {},
    hasFocus: () => true,
  } as unknown as EditorView;

  function keyEvent(token: string) {
    if (token === "<Esc>") return { key: "Escape" };
    if (token === "<CR>") return { key: "Enter" };
    if (token === "<BS>") return { key: "Backspace" };
    if (token === "<Space>") return { key: " " };
    const control = /^<C-(.)>$/.exec(token);
    if (control) return { key: control[1]!, ctrlKey: true };
    return { key: token };
  }

  function press(keys: string) {
    const tokens = keys.match(/<[^>]+>|./gu) ?? [];
    for (const token of tokens) {
      const event = {
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        keyCode: 0,
        preventDefault() {},
        ...keyEvent(token),
      };
      const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);
      if (!handled && vimModeOf(state, enabled) === "insert") {
        for (const other of state.plugins) {
          if (other === plugin) continue;
          if (other.props.handleKeyDown?.call(other, view, event as unknown as KeyboardEvent)) break;
        }
      }
    }
  }

  function type(text: string) {
    const { from, to } = state.selection;
    const fallback = () => state.tr.insertText(text, from, to);
    for (const candidate of state.plugins) {
      if (candidate.props.handleTextInput?.call(candidate, view, from, to, text, fallback)) return;
    }
    view.dispatch(fallback());
  }

  return {
    view,
    press,
    type,
    host,
    calls,
    markdown: () => serializeProductMarkdown(state.doc),
    mode: () => vimModeOf(state, enabled),
    cursor: () => state.selection.head,
    textAtCursor: () => state.doc.textBetween(state.selection.head, state.selection.head + 1),
  };
}

test("normal mode swallows typing and the cursor sits on a character", () => {
  const editor = createHarness("hello world");
  assert.equal(editor.mode(), "normal");
  editor.press("x");
  assert.equal(editor.markdown(), "ello world");
  editor.press("$");
  assert.equal(editor.textAtCursor(), "d");
  editor.press("0");
  assert.equal(editor.textAtCursor(), "e");
});

test("insert mode types normally and Escape steps back onto the last character", () => {
  const editor = createHarness("ab");
  editor.press("A");
  assert.equal(editor.mode(), "insert");
  editor.type("cd");
  assert.equal(editor.markdown(), "abcd");
  editor.press("<Esc>");
  assert.equal(editor.mode(), "normal");
  assert.equal(editor.textAtCursor(), "d");
});

test("operators with word motions, counts, and text objects", () => {
  const editor = createHarness("one two three four");
  editor.press("dw");
  assert.equal(editor.markdown(), "two three four");
  editor.press("2dw");
  assert.equal(editor.markdown(), "four");
  const words = createHarness("alpha beta gamma", "beta");
  words.press("ciw");
  assert.equal(words.mode(), "insert");
  words.type("delta");
  words.press("<Esc>");
  assert.equal(words.markdown(), "alpha delta gamma");
  const change = createHarness("keep this word", "this");
  change.press("cw");
  change.type("that");
  change.press("<Esc>");
  assert.equal(change.markdown(), "keep that word");
  const quoted = createHarness('say "hi there" now', "there");
  quoted.press('di"');
  assert.equal(quoted.markdown(), 'say "" now');
});

test("linewise delete removes a list item and keeps the list valid", () => {
  const editor = createHarness("- one\n- two\n- three", "two");
  editor.press("dd");
  assert.equal(editor.markdown(), md("- one\n- three"));
  assert.equal(editor.textAtCursor(), "t");
  editor.press("dd");
  assert.equal(editor.markdown(), md("- one"));
  editor.press("dd");
  assert.equal(editor.markdown(), "");
});

test("yank and put work charwise and linewise", () => {
  const editor = createHarness("first\n\nsecond");
  editor.press("yyjp");
  assert.equal(editor.markdown(), md("first\n\nsecond\n\nfirst"));
  const chars = createHarness("abc");
  chars.press("ylp");
  assert.equal(chars.markdown(), "aabc");
  const paste = createHarness("x y", "y");
  paste.press("yiw0P");
  assert.equal(paste.markdown(), "yx y");
});

test("join, replace, toggle case, and number increments", () => {
  const editor = createHarness("one\\\ntwo\\\nthree");
  editor.press("J");
  assert.equal(editor.markdown(), md("one two\\\nthree"));
  assert.equal(editor.textAtCursor(), " ");
  editor.press("0rO");
  assert.equal(editor.markdown(), md("One two\\\nthree"));
  editor.press("~~");
  assert.equal(editor.markdown(), md("oNe two\\\nthree"));
  const numbers = createHarness("step 41 done");
  numbers.press("5<C-a>");
  assert.equal(numbers.markdown(), "step 46 done");
  numbers.press("<C-x>");
  assert.equal(numbers.markdown(), "step 45 done");
});

test("visual mode selects with motions and applies operators", () => {
  const editor = createHarness("alpha beta gamma");
  editor.press("wve");
  assert.equal(editor.mode(), "visual");
  editor.press("d");
  assert.equal(editor.markdown(), "alpha  gamma");
  assert.equal(editor.mode(), "normal");
  const lines = createHarness("- one\n- two\n- three");
  lines.press("Vjd");
  assert.equal(lines.markdown(), md("- three"));
  const upper = createHarness("make loud");
  upper.press("veU");
  assert.equal(upper.markdown(), "MAKE loud");
});

test("dot repeats the last change including inserted text", () => {
  const editor = createHarness("a b c d");
  editor.press("dw");
  editor.press(".");
  assert.equal(editor.markdown(), "c d");
  const insert = createHarness("x\\\ny");
  insert.press("A");
  insert.type("!");
  insert.press("<Esc>");
  insert.press("j.");
  assert.equal(insert.markdown(), md("x!\\\ny!"));
});

test("undo restores the document after a Vim edit", () => {
  const editor = createHarness("keep me");
  editor.press("dw");
  assert.equal(editor.markdown(), "me");
  editor.press("u");
  assert.equal(editor.markdown(), "keep me");
  editor.press("<C-r>");
  assert.equal(editor.markdown(), "me");
});

test("find motions repeat with ; and , and support operators", () => {
  const editor = createHarness("a-b-c-d");
  editor.press("f-;");
  assert.equal(editor.cursor(), 4);
  editor.press(",");
  assert.equal(editor.cursor(), 2);
  editor.press("ldt-");
  assert.equal(editor.markdown(), "a--c-d");
});

test("search jumps to matches, n repeats, and :s substitutes", () => {
  const editor = createHarness("cat dog cat bird");
  editor.press("/cat<CR>");
  assert.equal(editor.cursor(), 9);
  editor.press("n");
  assert.equal(editor.cursor(), 1);
  editor.press(":%s/cat/cow/g<CR>");
  assert.equal(editor.markdown(), "cow dog cow bird");
  editor.press(":s/dog/fox/<CR>");
  assert.equal(editor.markdown(), "cow fox cow bird");
  editor.press("0*");
  assert.equal(editor.cursor(), 9);
  editor.press("#");
  assert.equal(editor.cursor(), 1);
});

test("open line below and above enter insert mode on a new line", () => {
  const editor = createHarness("top");
  editor.press("o");
  assert.equal(editor.mode(), "insert");
  editor.type("below");
  editor.press("<Esc>");
  assert.equal(editor.markdown(), md("top\\\nbelow"));
  editor.press("O");
  editor.type("mid");
  editor.press("<Esc>");
  assert.equal(editor.markdown(), md("top\\\nmid\\\nbelow"));
});

test("list indentation uses the product list commands", () => {
  const editor = createHarness("- one\n- two", "two");
  editor.press(">>");
  assert.equal(editor.markdown(), md("- one\n  - two"));
  editor.press("<<");
  assert.equal(editor.markdown(), md("- one\n- two"));
});

test("macros record and replay keys and typed text", () => {
  const editor = createHarness("a\\\nb\\\nc");
  editor.press("qqA");
  editor.type(";");
  editor.press("<Esc>jq");
  editor.press("2@q");
  assert.equal(editor.markdown(), md("a;\\\nb;\\\nc;"));
});

test("ex commands reach the host and the document edges", () => {
  const editor = createHarness("line");
  editor.press(":w<CR>");
  editor.press(":12<CR>");
  editor.press("ZZ");
  editor.press("5G");
  assert.deepEqual(editor.calls, ["write", "jump:12", "write", "jump:5"]);
  const walk = createHarness("- one\n- two\n- three");
  walk.press("G");
  assert.equal(walk.textAtCursor(), "t");
  walk.press("gg");
  assert.equal(walk.textAtCursor(), "o");
  walk.press("k");
  assert.deepEqual(walk.calls, ["window:-1"]);
});

test("j and k step through wrapped rows when the view can measure them", () => {
  const editor = createHarness("abcdefghijklmnopqrstuvwxyz\n\n0123456789", "c");
  const measure = wrappedLayout(editor.view.state.doc, 10);
  Object.assign(editor.view, {
    coordsAtPos: (pos: number) => {
      const rect = measure(pos);
      assert.ok(rect);
      return { ...rect, right: rect.left + 10 };
    },
  });
  editor.press("j");
  assert.equal(editor.textAtCursor(), "m");
  editor.press("j");
  assert.equal(editor.textAtCursor(), "w");
  editor.press("j");
  assert.equal(editor.textAtCursor(), "2");
  editor.press("k");
  assert.equal(editor.textAtCursor(), "w");
  editor.press("2k");
  assert.equal(editor.textAtCursor(), "c");
  editor.press("$");
  assert.equal(editor.textAtCursor(), "z");
  editor.press("j");
  assert.equal(editor.textAtCursor(), "9");
  editor.press("k");
  assert.equal(editor.textAtCursor(), "z");
  editor.press("0vj");
  assert.equal(editor.mode(), "visual");
  assert.equal(editor.view.state.doc.textBetween(editor.view.state.selection.from, editor.view.state.selection.to), "abcdefghijk");
  editor.press("<Esc>");
  editor.press("G");
  editor.press("j");
  assert.deepEqual(editor.calls, ["window:1"]);
  const flat = createHarness("abcdefghijklmnopqrstuvwxyz\n\n0123456789", "c");
  flat.press("j");
  assert.equal(flat.textAtCursor(), "2");
});

test("named registers and the black hole register", () => {
  const editor = createHarness("one two");
  editor.press('"adw');
  editor.press('"_dw');
  assert.equal(editor.markdown(), "");
  editor.press('"ap');
  assert.equal(editor.markdown(), "one ");
});

test("a mouse selection enters visual mode and collapsing leaves it", () => {
  const editor = createHarness("select me");
  editor.view.dispatch(
    editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 1, 7)),
  );
  assert.equal(editor.mode(), "visual");
  editor.press("d");
  assert.equal(editor.markdown(), " me");
});

test("when Vim is off every key passes through untouched", () => {
  const editor = createHarness("plain", undefined, false);
  assert.equal(editor.mode(), "insert");
  editor.press("x");
  editor.type("x");
  assert.equal(editor.markdown(), "xplain");
});
