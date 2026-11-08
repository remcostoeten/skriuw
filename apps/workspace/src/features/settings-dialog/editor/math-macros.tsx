import { useState } from "react";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { commitOperations } from "@/store/commit";
import {
  mathMacrosFromSettings,
  parseMathMacrosDraft,
  validateMathMacros,
} from "@/features/editor/math";
import type { SectionProps } from "../sections";
import { settingsCopy } from "@/shared/ui/settings-copy";
import { cn } from "@/shared/styling/class-names";
import {
  SettingsGroup,
  SettingsRow,
  settingsButton,
  settingsButtonPrimary,
  settingsRowDescription,
  settingsTextInput,
} from "@/shared/ui/settings-controls";

function selectMathMacros(state: RendererState) {
  return mathMacrosFromSettings(state.settings);
}

export function MathMacrosSettings({ store }: SectionProps) {
  const macros = useRendererSelector(store, selectMathMacros);
  const source = Object.entries(macros)
    .map(([name, definition]) => `${name} = ${definition}`)
    .join("\n");
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const value = draft ?? source;

  async function save(): Promise<void> {
    const parsed = parseMathMacrosDraft(value);
    if (!parsed.ok) {
      setMessage(parsed.message);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const error = await validateMathMacros(parsed.macros);
      if (error) {
        setMessage(error);
        return;
      }
      await commitOperations(store, [{ type: "set_math_macros", macros: parsed.macros }]);
      setDraft(null);
      setMessage(settingsCopy.editor.mathMacrosSaved);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : settingsCopy.editor.mathMacrosCouldNotBeSaved,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsGroup
      id="math"
      title={settingsCopy.editor.mathMacros}
      hint={<span id="settings-math-macros-help">{settingsCopy.editor.mathMacrosPortability}</span>}
      keywords="katex latex tex math mhchem"
    >
      <SettingsRow
        label="Workspace macros"
        detail={settingsCopy.editor.mathMacrosDescription}
        changed={source.length > 0}
        stack
      >
        <textarea
          id="settings-math-macros"
          aria-label="Workspace macros"
          className={cn(settingsTextInput, "min-h-28 w-full font-mono leading-[1.6]")}
          value={value}
          spellCheck={false}
          disabled={saving}
          aria-describedby="settings-math-macros-help settings-math-macros-status"
          placeholder={settingsCopy.editor.rMathbbrnormLeftlvert1Rightrvert}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setMessage(null);
          }}
        />
        <span className="flex items-center justify-end gap-2">
          <span
            id="settings-math-macros-status"
            role="status"
            className={cn(settingsRowDescription, "mr-auto")}
          >
            {message}
          </span>
          <button
            type="button"
            disabled={saving || value === source}
            onClick={() => {
              void save();
            }}
            className={cn(settingsButton, settingsButtonPrimary)}
          >
            {saving ? "Checking macros…" : settingsCopy.editor.saveMathMacros}
          </button>
        </span>
      </SettingsRow>
    </SettingsGroup>
  );
}
