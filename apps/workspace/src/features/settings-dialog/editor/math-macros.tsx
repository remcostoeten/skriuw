import { useState } from "react";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { commitOperations } from "@/store/commit";
import {
  mathMacrosFromSettings,
  parseMathMacrosDraft,
  validateMathMacros,
} from "@/features/editor/math";
import type { SectionProps } from "../sections";
import { settingsCopy } from "@/shared/ui/settings-copy";
import {
  settingsGroup,
  settingsGroupTitle,
  settingsRowDescription,
  settingsTextInput,
} from "@/shared/ui/settings-controls";

export function MathMacrosSettings({ store }: SectionProps) {
  const macros = useRendererSelector(store, (state) => mathMacrosFromSettings(state.settings));
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
    <div className={settingsGroup}>
      <div className={settingsGroupTitle}>{settingsCopy.editor.mathMacros}</div>
      <label htmlFor="settings-math-macros" className={settingsRowDescription}>
        {settingsCopy.editor.mathMacrosDescription}
      </label>
      <textarea
        id="settings-math-macros"
        className={`${settingsTextInput} min-h-28 w-full font-mono`}
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
      <p id="settings-math-macros-help" className={settingsRowDescription}>
        {settingsCopy.editor.mathMacrosPortability}
      </p>
      <button
        type="button"
        disabled={saving || value === source}
        onClick={() => {
          void save();
        }}
        className="rounded-md border border-border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-accent"
      >
        {saving ? "Checking macros…" : settingsCopy.editor.saveMathMacros}
      </button>
      <p id="settings-math-macros-status" role="status" className={settingsRowDescription}>
        {message}
      </p>
    </div>
  );
}
