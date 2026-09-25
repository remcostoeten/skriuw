import type { ReactNode } from "react";
import { typographyStories, type TypeEntry, type TypographySpec } from "@skriuw/storybook-shell";
import {
  EDITOR_FONT_OPTIONS,
  EDITOR_LINE_HEIGHT_OPTIONS,
} from "@/features/settings/settings-model";

type EditorAttributes = { font?: string; lineHeight?: string };

function inEditor({ font = "inter", lineHeight = "comfortable" }: EditorAttributes = {}) {
  return (specimen: ReactNode) => (
    <div className="prosemirror-host" data-editor-font={font} data-editor-line-height={lineHeight}>
      <div className="ProseMirror" style={{ minHeight: 0 }}>
        {specimen}
      </div>
    </div>
  );
}

const EDITOR_STYLES: readonly TypeEntry[] = (
  [
    { name: "Heading 1", as: "h1" },
    { name: "Heading 2", as: "h2" },
    { name: "Heading 3", as: "h3" },
    { name: "Heading 4", as: "h4" },
    { name: "Heading 5", as: "h5" },
    { name: "Heading 6", as: "h6", description: "Secondary text color." },
    { name: "Paragraph", as: "p" },
    { name: "Blockquote", as: "blockquote" },
    { name: "Inline code", as: "code", sample: "const note = workspace.open(id)" },
    { name: "Code block", as: "pre", sample: 'fn main() {\n    println!("skriuw");\n}' },
  ] satisfies TypeEntry[]
).map((entry) => ({ ...entry, wrap: inEditor() }));

const EDITOR_FONT_DESCRIPTIONS: Record<string, string> = {
  inter: "Inherits the interface system stack.",
  serif: "Georgia, Times New Roman, serif.",
  mono: "--font-mono inside the editor.",
};
const TEXT_WEIGHTS = [400, 500, 600, 700];

const SPEC: TypographySpec = {
  families: [
    {
      name: "Interface",
      description: "System UI stack on :root; every control, menu and sidebar.",
      weights: [400, 500, 560, 600, 650],
    },
    ...EDITOR_FONT_OPTIONS.map((option) => ({
      name: `Editor · ${option.label}`,
      description: `editorFont = "${option.value}". ${EDITOR_FONT_DESCRIPTIONS[option.value]}`,
      weights: TEXT_WEIGHTS,
      wrap: inEditor({ font: option.value }),
    })),
    {
      name: "Mono",
      description: "--font-mono; code, shortcuts, tabular values.",
      style: { fontFamily: "var(--font-mono)" },
      weights: [400, 500, 600],
    },
  ],
  sizes: [
    { name: "10px · Micro", className: "text-[10px]", description: "Badges, counters, kbd hints." },
    {
      name: "11px · Caption",
      className: "text-[11px]",
      description: "Metadata, section labels; the most used size.",
    },
    {
      name: "12px · Small",
      className: "text-[12px]",
      description: "Secondary rows, tooltips, menus.",
    },
    { name: "13px · Body", className: "text-[13px]", description: "Default interface text." },
    { name: "14px · Emphasis", className: "text-[14px]" },
    { name: "15px · Large", className: "text-[15px]" },
    { name: "16px · Editor", description: "Editor body text.", wrap: inEditor() },
    {
      name: "19px · Entity title",
      className: "text-[19px] font-[650] leading-[1.25] tracking-[-0.02em]",
      description: "Tag and person detail headers.",
    },
    {
      name: "34px · Display",
      className: "text-[34px] font-semibold leading-none tracking-tight",
      description: "Journal day heading.",
    },
  ],
  lineHeights: EDITOR_LINE_HEIGHT_OPTIONS.map((option) => ({
    name: option.label,
    description: `editorLineHeight = "${option.value}"`,
    wrap: inEditor({ lineHeight: option.value }),
  })),
  styles: EDITOR_STYLES,
  sample: "Write it down before it's gone",
};

export const fontStories = typographyStories(SPEC, {
  descriptions: {
    styles:
      "Editor text styles, rendered inside the real .prosemirror-host so they follow editor.css.",
  },
});
