# Code Block Redesign — Context for Design Engineer

## Stack

| Thing | Value |
|---|---|
| Editor framework | [BlockNote](https://www.blocknotejs.org/) v0.46.2 (`@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`) |
| Syntax highlighting | Shiki v4 (`shiki/core`, `shiki/engine/oniguruma`) |
| UI framework | React + Tailwind (shadcn-style tokens via CSS variables) |
| Rendering model | BlockNote block specs return **plain DOM nodes**, not React components. See "Approaches" below. |

---

## What the user sees

1. Type ```` ```ts `` followed by space → input rule matches `/^```(.*?)\s$/` → block converts to `codeBlock` with `language: "typescript"` prop (aliased via `SUPPORTED_LANGUAGES`)
2. The block renders as `<pre><code>` with a `<select>` dropdown for language switching
3. Shiki applies syntax highlighting via a ProseMirror plugin (`lazyShikiPlugin`)
4. Tab inserts 4 spaces (custom ProseMirror plugin overrides BlockNote's default 2-space)

---

## File 1: Language list + spec factory

**`apps/web/src/features/editor/components/block-specs/code-highlighter.ts`**

```ts
import { createCodeBlockSpec, type CodeBlockOptions } from "@blocknote/core";

const SUPPORTED_LANGUAGES: NonNullable<CodeBlockOptions["supportedLanguages"]> = {
	text: { name: "Plain text", aliases: ["plaintext", "txt", "none"] },
	javascript: { name: "JavaScript", aliases: ["js"] },
	typescript: { name: "TypeScript", aliases: ["ts"] },
	tsx: { name: "TSX", aliases: ["jsx"] },
	json: { name: "JSON" },
	markdown: { name: "Markdown", aliases: ["md", "mdx"] },
	bash: { name: "Bash", aliases: ["sh", "shell", "zsh"] },
	css: { name: "CSS" },
	html: { name: "HTML" },
	python: { name: "Python", aliases: ["py"] },
	sql: { name: "SQL" },
	yaml: { name: "YAML", aliases: ["yml"] },
};

export function createSyntaxHighlightedCodeBlockSpec() {
	return createCodeBlockSpec({
		defaultLanguage: "text",
		supportedLanguages: SUPPORTED_LANGUAGES,
		indentLineWithTab: true,
		createHighlighter: async () => {
			const { createHighlighterCore } = await import("shiki/core");
			const { createOnigurumaEngine } = await import("shiki/engine/oniguruma");
			const [
				theme,
				javascript,
				typescript,
				tsx,
				jsx,
				json,
				markdown,
				bash,
				css,
				html,
				python,
				sql,
				yaml,
				wasm,
			] = await Promise.all([
				import("shiki/themes/github-dark-default.mjs"),
				import("shiki/langs/javascript.mjs"),
				import("shiki/langs/typescript.mjs"),
				import("shiki/langs/tsx.mjs"),
				import("shiki/langs/jsx.mjs"),
				import("shiki/langs/json.mjs"),
				import("shiki/langs/markdown.mjs"),
				import("shiki/langs/bash.mjs"),
				import("shiki/langs/css.mjs"),
				import("shiki/langs/html.mjs"),
				import("shiki/langs/python.mjs"),
				import("shiki/langs/sql.mjs"),
				import("shiki/langs/yaml.mjs"),
				import("shiki/wasm"),
			]);

			return createHighlighterCore({
				themes: [theme],
				langs: [
					javascript, typescript, tsx, jsx, json, markdown,
					bash, css, html, python, sql, yaml,
				],
				engine: createOnigurumaEngine(wasm),
			});
		},
	});
}
```

---

## File 2: Schema registration

**`apps/web/src/features/editor/components/inline-specs/schema.ts`**

```ts
import {
	BlockNoteSchema,
	defaultBlockSpecs,
	defaultInlineContentSpecs,
} from "@blocknote/core";
import { noteLinkInlineSpec } from "./note-link-spec";
import { tagInlineSpec } from "./tag-spec";
import { userInlineSpec } from "./user-spec";
import { personInlineSpec } from "./person-spec";
import { createCheckListItem } from "../block-specs/checklist-item";
import { createFileTree } from "../block-specs/file-tree";
import { createSyntaxHighlightedCodeBlockSpec } from "../block-specs/code-highlighter";

export const editorSchema = BlockNoteSchema.create({
	blockSpecs: {
		...defaultBlockSpecs,
		codeBlock: createSyntaxHighlightedCodeBlockSpec(),
		checkListItem: createCheckListItem(),
		fileTree: createFileTree(),
	},
	inlineContentSpecs: {
		...defaultInlineContentSpecs,
		noteLink: noteLinkInlineSpec,
		tag: tagInlineSpec,
		user: userInlineSpec,
		person: personInlineSpec,
	},
});

export type EditorSchema = typeof editorSchema;
```

---

## File 3: Editor component (where BlockNoteView + code block CSS live)

**`apps/web/src/features/editor/components/rich-text-editor.tsx`** (relevant excerpts)

```tsx
// Editor creation (lines ~1864)
const editor = useCreateBlockNote(
	collab
		? { schema: editorSchema, collaboration: { ... } }
		: { schema: editorSchema, initialContent: initialBlocks },
);

// Tab-indent plugin registration (lines ~1987)
useEffect(() => {
	const tiptap = editor._tiptapEditor;
	if (!tiptap || readOnly) return;
	tiptap.registerPlugin(
		createCodeBlockIndentPlugin(),
		(indentPlugin, plugins) => [indentPlugin, ...plugins],
	);
	return () => { tiptap.unregisterPlugin(codeBlockIndentPluginKey); };
}, [editor, readOnly]);

// BlockNoteView rendering (lines ~2772)
<BlockNoteView
	editor={editor}
	editable={!readOnly}
	onChange={handleEditorChange}
	theme={blockNoteTheme}
	className="h-full"
	formattingToolbar={false}
	linkToolbar={false}
	slashMenu={false}
>
	{/* suggestion menus, selection bubble, etc. */}
</BlockNoteView>

// Code block CSS (lines ~3558)
.blocknote-wrapper pre,
.blocknote-wrapper pre code,
.blocknote-wrapper [data-content-type="codeBlock"],
.blocknote-wrapper [data-content-type="codeBlock"] * {
	white-space: pre-wrap !important;
	overflow-wrap: anywhere;
	word-break: break-word;
}
.blocknote-wrapper pre {
	max-width: 100%;
	overflow-x: hidden;
}
```

---

## File 4: Tab-indent ProseMirror plugin

**`apps/web/src/features/editor/lib/code-block-indent-plugin.ts`**

```ts
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export const codeBlockIndentPluginKey = new PluginKey("code-block-indent");

const INDENT = "    ";

function isInCodeBlock(view: EditorView): boolean {
	return view.state.selection.$from.parent.type.name === "codeBlock";
}

export function createCodeBlockIndentPlugin(): Plugin {
	return new Plugin({
		key: codeBlockIndentPluginKey,
		props: {
			handleKeyDown(view, event) {
				if (event.key !== "Tab" || event.shiftKey || event.metaKey || event.ctrlKey) {
					return false;
				}
				if (!isInCodeBlock(view)) {
					return false;
				}
				event.preventDefault();
				view.dispatch(view.state.tr.insertText(INDENT).scrollIntoView());
				return true;
			},
		},
	});
}
```

---

## File 5: BlockNote core renderer (WHAT YOU'RE REPLACING)

**`node_modules/@blocknote/core/src/blocks/Code/block.ts`** (lines 110–161)

This is the built-in render function that creates the DOM. You can replace this entirely with your own implementation by passing a custom `render` function in `createCodeBlockSpec`.

```ts
render(block, editor) {
	const wrapper = document.createDocumentFragment();
	const pre = document.createElement("pre");
	const code = document.createElement("code");
	pre.appendChild(code);

	let removeSelectChangeListener;

	if (options.supportedLanguages) {
		const select = document.createElement("select");
		Object.entries(options.supportedLanguages ?? {}).forEach(
			([id, { name }]) => {
				const option = document.createElement("option");
				option.value = id;
				option.text = name;
				select.appendChild(option);
			},
		);
		select.value = block.props.language || options.defaultLanguage || "text";

		if (editor.isEditable) {
			const handleLanguageChange = (event: Event) => {
				const language = (event.target as HTMLSelectElement).value;
				editor.updateBlock(block.id, { props: { language } });
			};
			select.addEventListener("change", handleLanguageChange);
			removeSelectChangeListener = () =>
				select.removeEventListener("change", handleLanguageChange);
		} else {
			select.disabled = true;
		}

		const selectWrapper = document.createElement("div");
		selectWrapper.contentEditable = "false";
		selectWrapper.appendChild(select);
		wrapper.appendChild(selectWrapper);
	}
	wrapper.appendChild(pre);

	return {
		dom: wrapper,
		contentDOM: code,
		destroy: () => { removeSelectChangeListener?.(); },
	};
},
```

The `toExternalHTML` (used for copy/paste) renders:

```ts
toExternalHTML(block) {
	const pre = document.createElement("pre");
	const code = document.createElement("code");
	code.className = `language-${block.props.language}`;
	code.dataset.language = block.props.language;
	pre.appendChild(code);
	return { dom: pre, contentDOM: code };
},
```

---

## File 6: Input rule (how ` ```ts ` becomes a code block)

Also in `node_modules/@blocknote/core/src/blocks/Code/block.ts` (lines 275–293):

```ts
inputRules: [
	{
		find: /^```(.*?)\s$/,
		replace: ({ match }) => {
			const languageName = match[1].trim();
			const attributes = {
				language: getLanguageId(options, languageName) ?? languageName,
			};
			return {
				type: "codeBlock",
				props: { language: attributes.language },
				content: [],
			};
		},
	},
],
```

The `getLanguageId` helper maps aliases → IDs (lines 299–308):

```ts
export function getLanguageId(
	options: CodeBlockOptions,
	languageName: string,
): string | undefined {
	return Object.entries(options.supportedLanguages ?? {}).find(
		([id, { aliases }]) => {
			return aliases?.includes(languageName) || id === languageName;
		},
	)?.[0];
}
```

---

## File 7: Markdown serialization (code fence in ↔ out)

**`apps/web/src/domain/notes/rich-document.ts`** (lines 356–357, 595–622)

```ts
const CODE_FENCE_OPEN_PATTERN = /^\s{0,3}```(.*)$/;
const CODE_FENCE_CLOSE_PATTERN = /^\s{0,3}```\s*$/;

// Parsing markdown → blocks:
const fenceMatch = line.match(CODE_FENCE_OPEN_PATTERN);
if (fenceMatch) {
	const language = fenceMatch[1].trim();
	i++;
	const codeLines: string[] = [];
	while (i < lines.length && !CODE_FENCE_CLOSE_PATTERN.test(lines[i])) {
		codeLines.push(lines[i]);
		i++;
	}
	const code = codeLines.join("\n");
	if (i < lines.length) i++;
	// fileTree check omitted for brevity
	blocks.push({
		type: "codeBlock",
		props: { language: language || "plaintext" },
		content: code,
	});
	continue;
}
```

---

## Approaches to redesign

### Option A: Keep BlockNote's `createCodeBlockSpec`, style the output (easiest)

Keep calling `createCodeBlockSpec()` and add CSS. You get the `<select>` dropdown and `<pre><code>` for free. Only cosmetic changes (colors, fonts, copy button via CSS pseudo-elements / DOM manipulation in `render`).

### Option B: Custom `render()` in the spec (medium)

Pass a custom `render` function to `createCodeBlockSpec`. You control the full DOM output. You can:
- Replace the `<select>` with a styled language badge/dropdown
- Add a copy-to-clipboard button
- Add line numbers
- Use React by mounting a root inside `render()`:

```ts
render(block, editor) {
	const wrapper = document.createElement("div");
	const root = createRoot(wrapper);
	root.render(<CodeBlockUI block={block} editor={editor} />);
	return {
		dom: wrapper,
		contentDOM: wrapper.querySelector("[contenteditable]")!,
		destroy: () => root.unmount(),
	};
}
```

### Option C: Custom block spec entirely (most flexible)

Skip `createCodeBlockSpec` and write a block spec from scratch using `BlockNoteSchema`'s block spec interface. Full control over schema, parsing, rendering, and serialization. Requires understanding BlockNote's [custom block API](https://www.blocknotejs.org/docs/custom-schemas/blocks).

---

## Design tokens (CSS variables)

The app uses HSL-encoded CSS custom properties (values are `hue saturation lightness` — apply via `hsl(var(--name))` or `hsl(var(--name) / alpha)`). There are 3 themes (`mocha`, `midnight`, `latte`); below is the dark default **mocha** with actual values:

### Core (always available)

```css
--background: 25 20% 7%;          /* page bg */
--foreground: 30 25% 85%;         /* body text */
--card: 25 18% 10%;               /* editor surface */
--card-foreground: 30 25% 85%;    /* text on editor */
--popover: 25 20% 6%;             /* dropdown/menu bg */
--popover-foreground: 30 22% 80%; /* text on popover */
--primary: 28 16% 25%;
--primary-foreground: 30 25% 88%;
--secondary: 25 12% 15%;
--secondary-foreground: 30 18% 78%;
--muted: 25 10% 14%;
--muted-foreground: 28 8% 45%;    /* secondary text, placeholders */
--accent: 25 12% 20%;             /* hover states */
--accent-foreground: 30 25% 85%;
--destructive: 344 45% 26%;
--destructive-foreground: 0 0% 98%;
--border: 25 10% 18%;             /* dividers, outlines */
--input: 25 10% 18%;              /* form field border */
--ring: 28 16% 30%;               /* focus ring */
--radius: 0.375rem;               /* border-radius */
```

### Status & semantic

```css
--success: 145 48% 45%;
--success-foreground: 145 70% 94%;
--warning: 30 92% 48%;
--warning-foreground: 35 96% 86%;
--info: 200 78% 58%;
--info-foreground: 200 100% 94%;
--scrim: 0 0% 0%;                /* overlay backdrop */
```

### Surface hierarchy (haptic-*)

```css
--haptic-bg-deep: 25 20% 5%;     /* deepest layer */
--haptic-bg-sidebar: 25 20% 6%;  /* sidebar panel */
--haptic-bg-editor: 25 20% 7%;   /* editor surface (same as --background) */
--haptic-bg-hover: 25 10% 16%;   /* row hover */
--haptic-bg-active: 25 10% 20%;  /* active/selected row */
--haptic-text-dim: 28 8% 38%;    /* dimmer than muted */
--haptic-text-secondary: 28 8% 50%;
--haptic-accent-blue: 200 78% 58%;
--haptic-divider: 25 10% 16%;
```

### Editor-specific

```css
--editor-link: 200 80% 66%;
--editor-link-hover: 200 90% 76%;
--editor-note-link: 152 60% 56%;
--editor-note-link-hover: 152 70% 66%;
--editor-selection: 25 10% 15%;
--editor-shadow: 0 0% 0%;
```

### Sidebar

```css
--sidebar-background: 25 20% 6%;
--sidebar-foreground: 30 22% 80%;
--sidebar-primary: 28 16% 25%;
--sidebar-primary-foreground: 30 25% 88%;
--sidebar-accent: 25 10% 18%;
--sidebar-accent-foreground: 30 25% 85%;
--sidebar-border: 25 10% 16%;
--sidebar-ring: 28 16% 30%;
```

### Also available as `--color-*` utility tokens

```css
--color-background, --color-foreground, --color-card,
--color-card-foreground, --color-primary, --color-primary-foreground,
--color-secondary, --color-secondary-foreground,
--color-muted, --color-muted-foreground,
--color-accent, --color-accent-foreground,
--color-destructive, --color-destructive-foreground,
--color-border, --color-input, --color-ring, --color-popover,
--color-popover-foreground
```

These are set in `globals.css` as `hsl(var(--x))` for Tailwind's `bg-background`, `text-foreground`, etc.

### Code block environment (`.blocknote-wrapper`)

```css
/* Currently set inline in rich-text-editor.tsx: */
--bn-colors-editor-background: hsl(var(--card));
--bn-colors-editor-text: hsl(var(--card-foreground));
```

### Where the code block lives (rendering surface)

The editor renders inside a `.blocknote-wrapper` div. The flow background is `hsl(var(--card))` (`#1b1814` in mocha). The code block itself is a child of the editor's content area — it sits directly on the card surface with no container between it and the editor background.

In the DOM:
```
<div class="blocknote-wrapper">                       ← inherits --bn-colors-editor-background
  <div class="bn-editor">                             ← ProseMirror editable area
    <div data-content-type="codeBlock">               ← THE CODE BLOCK
      <div contentEditable="false">                   ← language <select> wrapper
        <select>...</select>
      </div>
      <pre>                                           ← code container
        <code contenteditable="true">...</code>
      </pre>
    </div>
  </div>
</div>
```

So the code block needs its own background — currently it's transparent, showing the `--card` surface underneath. For the redesign, give it its own surface (e.g. `--muted` / `--haptic-bg-hover`).

For the redesign: use `--haptic-bg-editor` / `--card` as the editor surface, `--muted` / `--haptic-bg-hover` for code block background, `--muted-foreground` for secondary UI (language label, line numbers), `--border` for outlines, and `--ring` for focus states.

## What to avoid

- Don't change the `contentDOM` node type — it must be a `<code>` element or BlockNote's ProseMirror schema will break
- The `dom` wrapper must contain `contentDOM` as a descendant
- The language prop (`block.props.language`) must remain a string — it's serialized to markdown and stored in the DB
- Don't remove the `toExternalHTML()` method — it's used for copy/paste and export
