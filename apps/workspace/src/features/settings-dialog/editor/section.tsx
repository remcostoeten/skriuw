import { MathMacrosSettings } from "@/features/settings-dialog/editor/math-macros";
import { settingsCopy } from "@/shared/ui/settings-copy";
import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import { updateSetting } from "@/features/settings/update-settings";
import {
  EDITOR_FONT_OPTIONS,
  EDITOR_LINE_HEIGHT_OPTIONS,
  VIM_CURSOR_STYLE_OPTIONS,
} from "@/features/settings/settings-model";
import type { SettingsViewModel } from "@/features/settings/settings-model";
import { EditorTypePreview } from "./type-preview";
import { cn } from "@/shared/styling/class-names";
import { Select, type SelectOption } from "@/shared/ui/select";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { todayKey } from "@skriuw/renderer-core/journal/dates";
import { setJournalWordGoal } from "@/features/journal/actions";
import {
  MAX_WORD_GOAL,
  WORD_GOAL_PRESETS,
  parseWordGoalInput,
  selectWordGoalHistory,
  wordGoalOn,
} from "@/features/journal/word-goal";
import {
  SettingSegmented,
  SettingToggle,
  SettingsGroup,
  SettingsRow,
  settingsInputRow,
  settingsSection,
  settingsTextInput,
} from "@/shared/ui/settings-controls";
import { useEditableSettings } from "@/features/settings/use-editable-settings";
import type { SectionProps } from "@/features/settings-dialog/sections";

const BROWSER_RUNTIME = isBrowserRuntime();

const CUSTOM_GOAL = "custom";

const WORD_GOAL_OPTIONS: readonly SelectOption<string>[] = [
  { value: "0", label: "Off" },
  ...WORD_GOAL_PRESETS.map((words) => ({ value: `${words}`, label: `${words} words` })),
  { value: CUSTOM_GOAL, label: "Custom" },
];

export function EditorSection({ store }: SectionProps) {
  const { settings, change, changed } = useEditableSettings(store);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.hasAttribute("data-directional-focus")) {
      return;
    }
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-directional-focus]"),
    );
    const index = controls.indexOf(target);
    const next = controls[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (!next) {
      return;
    }
    event.preventDefault();
    next.focus();
  }

  return (
    <section aria-label="Editor preferences" className={settingsSection} onKeyDown={handleKeyDown}>
      <SettingsGroup
        id="typography"
        title="Typography"
        preview={
          <EditorTypePreview
            font={settings.editorFont}
            lineHeight={settings.editorLineHeight}
            vimMode={settings.vimMode}
            vimCursorStyle={settings.vimCursorStyle}
            vimCursorBlink={settings.vimCursorBlink}
          />
        }
        keywords="font sans serif mono line spacing cozy comfortable relaxed"
      >
        <SettingSegmented
          label="Editor font"
          detail={settingsCopy.editor.usedForNoteContentInThe}
          value={settings.editorFont}
          options={EDITOR_FONT_OPTIONS}
          changed={changed("editorFont")}
          onChange={(value) => change("editorFont", value)}
        />
        <SettingSegmented
          label="Line spacing"
          detail={settingsCopy.editor.howMuchRoomEachLineOf}
          value={settings.editorLineHeight}
          options={EDITOR_LINE_HEIGHT_OPTIONS}
          changed={changed("editorLineHeight")}
          onChange={(value) => change("editorLineHeight", value)}
        />
      </SettingsGroup>
      <SettingsGroup id="writing" title="Writing" keywords="placeholder vim modal">
        <PlaceholderField
          store={store}
          settings={settings}
          changed={changed("editorPlaceholder")}
        />
        <SettingToggle
          label={settingsCopy.editor.defaultToRawMarkdown}
          detail={settingsCopy.editor.newNotesOpenInTheRaw}
          checked={settings.editorDefaultRawMode}
          changed={changed("editorDefaultRawMode")}
          onChange={(checked) => change("editorDefaultRawMode", checked)}
        />
        <SettingToggle
          label="Vim keybindings"
          detail={settingsCopy.editor.modalEditingInBothEditorsNormal}
          checked={settings.vimMode}
          changed={changed("vimMode")}
          onChange={(checked) => change("vimMode", checked)}
        />
        <SettingSegmented
          label="Vim cursor"
          detail={settingsCopy.editor.theCursorShapeUsedInNormal}
          value={settings.vimCursorStyle}
          options={VIM_CURSOR_STYLE_OPTIONS}
          changed={changed("vimCursorStyle")}
          onChange={(value) => change("vimCursorStyle", value)}
        />
        <SettingToggle
          label={settingsCopy.editor.blinkVimCursor}
          detail={settingsCopy.editor.blinkTheNormalmodeCursorInBoth}
          checked={settings.vimCursorBlink}
          changed={changed("vimCursorBlink")}
          onChange={(checked) => change("vimCursorBlink", checked)}
        />
      </SettingsGroup>
      <SettingsGroup id="focus" title="Focus" keywords="typewriter dim paragraphs">
        <SettingToggle
          label="Typewriter scrolling"
          detail={settingsCopy.editor.keepTheLineYouAreTyping}
          checked={settings.typewriterScrolling}
          changed={changed("typewriterScrolling")}
          onChange={(checked) => change("typewriterScrolling", checked)}
        />
        <SettingToggle
          label={settingsCopy.editor.dimOtherParagraphsInFocusMode}
          detail={settingsCopy.editor.focusModeModshiftfFadesEveryBlock}
          checked={settings.focusDimParagraphs}
          changed={changed("focusDimParagraphs")}
          onChange={(checked) => change("focusDimParagraphs", checked)}
        />
      </SettingsGroup>
      <SettingsGroup
        id="blocks"
        title={BROWSER_RUNTIME ? "Blocks and tabs" : "Blocks, tabs and links"}
        keywords="block handle drag gutter tabs links browser"
      >
        <SettingToggle
          label={settingsCopy.editor.blockHandleOnHover}
          detail={settingsCopy.editor.hoveringABlockShowsAGutter}
          checked={settings.blockDragHandle}
          changed={changed("blockDragHandle")}
          onChange={(checked) => change("blockDragHandle", checked)}
        />
        <SettingToggle
          label={settingsCopy.editor.openNotesInTabs}
          detail={settingsCopy.editor.everyNoteYouOpenGetsIts}
          checked={settings.openNotesInTabs}
          changed={changed("openNotesInTabs")}
          onChange={(checked) => change("openNotesInTabs", checked)}
        />
        {BROWSER_RUNTIME ? null : (
          <SettingToggle
            label={settingsCopy.editor.openLinksInSkriuw}
            detail={settingsCopy.editor.linksOpenInASkriuwBrowser}
            checked={settings.openLinksInApp}
            changed={changed("openLinksInApp")}
            onChange={(checked) => change("openLinksInApp", checked)}
          />
        )}
      </SettingsGroup>
      <SettingsGroup id="journal" title="Journal" keywords="daily word goal target count streak">
        <WordGoalSetting store={store} />
      </SettingsGroup>
      <MathMacrosSettings store={store} />
    </section>
  );
}

type Props = {
  store: SectionProps["store"];
  settings: SettingsViewModel;
  changed: boolean;
};

function PlaceholderField({ store, settings, changed }: Props) {
  const [value, setValue] = useState(settings.editorPlaceholder);

  useEffect(() => {
    setValue(settings.editorPlaceholder);
  }, [settings.editorPlaceholder]);

  return (
    <SettingsRow
      as="label"
      htmlFor="settings-placeholder"
      className={settingsInputRow}
      label={settingsCopy.editor.emptyNotePrompt}
      detail={settingsCopy.editor.shownBeforeANoteHasContent}
      changed={changed}
    >
      <input
        id="settings-placeholder"
        data-directional-focus
        className={settingsTextInput}
        type="text"
        value={value}
        maxLength={512}
        onChange={(event) => setValue(event.currentTarget.value)}
        onBlur={() => {
          if (value !== settings.editorPlaceholder) {
            updateSetting(store, "editorPlaceholder", value);
          }
        }}
      />
    </SettingsRow>
  );
}

function WordGoalSetting({ store }: { store: SectionProps["store"] }) {
  const history = useRendererSelector(store, selectWordGoalHistory);
  const goal = wordGoalOn(history, todayKey()) ?? 0;
  const isPreset = goal === 0 || WORD_GOAL_PRESETS.includes(goal);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [draft, setDraft] = useState(isPreset ? "" : `${goal}`);
  const choice = customOpen || !isPreset ? CUSTOM_GOAL : `${goal}`;

  useEffect(() => {
    if (!isPreset) {
      setDraft(`${goal}`);
    }
  }, [goal, isPreset]);

  function choose(value: string): void {
    if (value === CUSTOM_GOAL) {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    setJournalWordGoal(store, Number(value));
  }

  function commitDraft(): void {
    const words = parseWordGoalInput(draft);
    if (words !== null) {
      setJournalWordGoal(store, words);
    }
  }

  return (
    <SettingsRow
      className={settingsInputRow}
      label={settingsCopy.editor.dailyWordGoal}
      detail={settingsCopy.editor.showsQuietProgressInTheJournal}
      changed={goal !== 0}
    >
      <span className="flex shrink-0 items-center gap-2">
        {choice === CUSTOM_GOAL && (
          <input
            type="text"
            inputMode="numeric"
            aria-label={settingsCopy.editor.customDailyWordGoal}
            data-directional-focus
            className={cn(settingsTextInput, "w-20 tabular-nums")}
            value={draft}
            placeholder={`1 to ${MAX_WORD_GOAL}`}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitDraft();
              }
            }}
          />
        )}
        <Select
          label={settingsCopy.editor.dailyWordGoal}
          value={choice}
          options={WORD_GOAL_OPTIONS}
          onChange={choose}
          align="end"
        />
      </span>
    </SettingsRow>
  );
}
