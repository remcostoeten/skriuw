import { useEffect, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import { updateSetting } from "@/features/settings/update-settings";
import {
  EDITOR_FONT_OPTIONS,
  EDITOR_LINE_HEIGHT_OPTIONS,
  VIM_CURSOR_STYLE_OPTIONS,
} from "@/features/settings/settings-model";
import type { SettingsViewModel, VimCursorStyle } from "@/features/settings/settings-model";
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
  SettingCardPicker,
  SettingToggle,
  SettingsHeading,
  settingsGroup,
  settingsGroupTitle,
  settingsInputRow,
  settingsRow,
  settingsRowDescription,
  settingsRowLabel,
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

const FONT_PREVIEW_STYLES: Record<string, CSSProperties> = {
  inter: {},
  serif: { fontFamily: 'Georgia, "Times New Roman", serif' },
  mono: { fontFamily: "var(--font-mono)" },
};

const LINE_HEIGHT_PREVIEW_GAPS: Record<string, number> = {
  cozy: 3,
  comfortable: 5,
  relaxed: 8,
};

const FONT_PICKER_OPTIONS = EDITOR_FONT_OPTIONS.map((option) => ({
  ...option,
  preview: (
    <span
      className="text-xl leading-none text-foreground/80"
      style={FONT_PREVIEW_STYLES[option.value]}
      aria-hidden="true"
    >
      Ag
    </span>
  ),
}));

const LINE_HEIGHT_PICKER_OPTIONS = EDITOR_LINE_HEIGHT_OPTIONS.map((option) => ({
  ...option,
  preview: <LineSpacingPreview gap={LINE_HEIGHT_PREVIEW_GAPS[option.value] ?? 5} />,
}));

const VIM_CURSOR_PICKER_OPTIONS = VIM_CURSOR_STYLE_OPTIONS.map((option) => ({
  ...option,
  preview: <VimCursorPreview style={option.value} />,
}));

function VimCursorPreview({ style }: { style: VimCursorStyle }) {
  return (
    <span className="font-mono text-xl text-foreground/75" aria-hidden="true">
      a
      <span
        className={cn(
          "inline-flex h-6 w-[0.72em] items-center justify-center text-foreground",
          style === "block" && "rounded-[2px] bg-foreground/75 text-background",
          style === "underline" && "border-b-2 border-foreground/80",
          style === "bar" && "border-l-2 border-foreground/80",
        )}
      >
        b
      </span>
      c
    </span>
  );
}

function LineSpacingPreview({ gap }: { gap: number }) {
  return (
    <span className="flex w-full flex-col justify-center px-5" style={{ gap }} aria-hidden="true">
      <span className="h-[3px] w-full rounded-full bg-foreground/25" />
      <span className="h-[3px] w-4/5 rounded-full bg-foreground/25" />
      <span className="h-[3px] w-[90%] rounded-full bg-foreground/25" />
      <span className="h-[3px] w-3/5 rounded-full bg-foreground/25" />
    </span>
  );
}

export function EditorSection({ store }: SectionProps) {
  const { settings, change } = useEditableSettings(store);

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
      <SettingsHeading
        title="Editor"
        detail="Tune the writing surface without changing note content."
      />
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Typography</div>
        <SettingCardPicker
          label="Editor font"
          detail="Used for note content in the rendered editor."
          value={settings.editorFont}
          options={FONT_PICKER_OPTIONS}
          onChange={(value) => change("editorFont", value)}
        />
        <SettingCardPicker
          label="Line spacing"
          detail="How much room each line of text gets."
          value={settings.editorLineHeight}
          options={LINE_HEIGHT_PICKER_OPTIONS}
          onChange={(value) => change("editorLineHeight", value)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Writing</div>
        <PlaceholderField store={store} settings={settings} />
        <SettingToggle
          label="Default to raw Markdown"
          detail="New notes open in the raw Markdown editor. Toggle any note with mod+m."
          checked={settings.editorDefaultRawMode}
          onChange={(checked) => change("editorDefaultRawMode", checked)}
        />
        <SettingToggle
          label="Vim keybindings"
          detail="Modal editing in both editors: normal, insert, and visual modes with counts, operators, text objects, registers, dot repeat, and : commands. Toggle anywhere with mod+alt+i."
          checked={settings.vimMode}
          onChange={(checked) => change("vimMode", checked)}
        />
        <SettingCardPicker
          label="Vim cursor"
          detail="The cursor shape used in normal and visual modes."
          value={settings.vimCursorStyle}
          options={VIM_CURSOR_PICKER_OPTIONS}
          onChange={(value) => change("vimCursorStyle", value)}
        />
        <SettingToggle
          label="Blink Vim cursor"
          detail="Blink the normal-mode cursor in both rendered and raw Markdown editors."
          checked={settings.vimCursorBlink}
          onChange={(checked) => change("vimCursorBlink", checked)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Focus</div>
        <SettingToggle
          label="Typewriter scrolling"
          detail="Keep the line you are typing on in the middle of the screen, in both editors. Toggle anywhere with mod+shift+y."
          checked={settings.typewriterScrolling}
          onChange={(checked) => change("typewriterScrolling", checked)}
        />
        <SettingToggle
          label="Dim other paragraphs in focus mode"
          detail="Focus mode (mod+shift+f) fades every block except the one holding the caret. Applies to the rendered editor."
          checked={settings.focusDimParagraphs}
          onChange={(checked) => change("focusDimParagraphs", checked)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Blocks</div>
        <SettingToggle
          label="Block handle on hover"
          detail="Hovering a block shows a gutter to drag it somewhere else, insert below it, or open its actions. Alt+Arrow and the slash menu keep working when this is off."
          checked={settings.blockDragHandle}
          onChange={(checked) => change("blockDragHandle", checked)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Tabs</div>
        <SettingToggle
          label="Open notes in tabs"
          detail="Every note you open gets its own tab. When off, opening a note replaces the current tab."
          checked={settings.openNotesInTabs}
          onChange={(checked) => change("openNotesInTabs", checked)}
        />
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Journal</div>
        <WordGoalSetting store={store} />
      </div>
      {BROWSER_RUNTIME ? null : (
        <div className={settingsGroup}>
          <div className={settingsGroupTitle}>Links</div>
          <SettingToggle
            label="Open links in Skriuw"
            detail="Links open in a Skriuw browser window instead of your system browser. The link menu always offers the other one too."
            checked={settings.openLinksInApp}
            onChange={(checked) => change("openLinksInApp", checked)}
          />
        </div>
      )}
    </section>
  );
}

type Props = {
  store: SectionProps["store"];
  settings: SettingsViewModel;
};

function PlaceholderField({ store, settings }: Props) {
  const [value, setValue] = useState(settings.editorPlaceholder);

  useEffect(() => {
    setValue(settings.editorPlaceholder);
  }, [settings.editorPlaceholder]);

  return (
    <label className={cn(settingsRow, settingsInputRow)} htmlFor="settings-placeholder">
      <span className={settingsRowLabel}>
        Empty note prompt
        <span className={settingsRowDescription}>Shown before a note has content.</span>
      </span>
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
    </label>
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
    <div className={cn(settingsRow, settingsInputRow)}>
      <span className={settingsRowLabel}>
        Daily word goal
        <span className={settingsRowDescription}>
          Shows quiet progress in the journal day header and counts goal days in the stats. A change
          applies from today; earlier days keep the goal they had.
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {choice === CUSTOM_GOAL && (
          <input
            type="text"
            inputMode="numeric"
            aria-label="Custom daily word goal"
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
          label="Daily word goal"
          value={choice}
          options={WORD_GOAL_OPTIONS}
          onChange={choose}
          align="end"
        />
      </span>
    </div>
  );
}
