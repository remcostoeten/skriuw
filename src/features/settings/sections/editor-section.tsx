"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { usePreferencesStore } from "@/features/settings/store";
import { SectionHeader, Row, SettingsCard } from "@/features/settings/components/settings-primitives";
import { DefaultFontDemo, LineHeightDemo, RawMdxModeDemo } from "@/features/settings/demos";
import { EditorFontPicker } from "@/features/settings/components/editor-font-picker";
import {
  EDITOR_LINE_HEIGHTS,
  getEditorLineHeightLabel,
} from "@/features/editor/lib/editor-line-height";

export function EditorSection() {
  const editor = usePreferencesStore((s) => s.editor);
  const update = usePreferencesStore((s) => s.updateEditorPreference);

  return (
    <>
      <SectionHeader title="Editor" description="How writing in Skriuw should feel." />
      <SettingsCard>
        <Row
          title="Default font"
          description="Used in the rich text editor."
          visualization={<DefaultFontDemo fontId={editor.defaultFont} />}
        >
          <EditorFontPicker
            value={editor.defaultFont}
            onChange={(value) => update("defaultFont", value)}
          />
        </Row>
        <Row
          title="Line height"
          description="Spacing between lines of text."
          visualization={<LineHeightDemo lineHeight={editor.lineHeight} />}
        >
          <Select
            value={editor.lineHeight}
            onValueChange={(value) =>
              update("lineHeight", value as typeof editor.lineHeight)
            }
          >
            <SelectTrigger className="h-8 w-52">
              <SelectValue placeholder="Select line height" />
            </SelectTrigger>
            <SelectContent>
              {EDITOR_LINE_HEIGHTS.map((lineHeight) => (
                <SelectItem key={lineHeight} value={lineHeight}>
                  {getEditorLineHeightLabel(lineHeight)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row title="Spellcheck" description="Underline misspelled words.">
          <Switch
            checked={editor.spellcheck}
            onCheckedChange={(v) => update("spellcheck", v)}
          />
        </Row>
        <Row title="Smart punctuation" description="Auto-convert quotes and dashes.">
          <Switch
            checked={editor.smartPunctuation}
            onCheckedChange={(v) => update("smartPunctuation", v)}
          />
        </Row>
        <Row title="Markdown shortcuts" description="Use # and * to format inline.">
          <Switch
            checked={editor.markdownShortcuts}
            onCheckedChange={(v) => update("markdownShortcuts", v)}
          />
        </Row>
        <Row
          title="Default to Raw MDX"
          description="New notes open in raw MDX mode."
          visualization={<RawMdxModeDemo enabled={editor.defaultModeRaw} />}
        >
          <Switch
            checked={editor.defaultModeRaw}
            onCheckedChange={(v) => update("defaultModeRaw", v)}
          />
        </Row>
      </SettingsCard>
    </>
  );
}
