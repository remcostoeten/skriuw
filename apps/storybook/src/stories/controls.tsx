import { useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Radio } from "@/shared/ui/radio";
import { Select, type SelectOption } from "@/shared/ui/select";
import { InlineEdit } from "@/shared/ui/inline-edit";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import { HoldToConfirm } from "@/shared/ui/hold-to-confirm";
import { ShortcutRecorder } from "@/shared/ui/shortcut-recorder";
import { showToast } from "@/shared/ui/toast";
import buttonSource from "@/shared/ui/button.tsx?raw";
import checkboxSource from "@/shared/ui/checkbox.tsx?raw";
import radioSource from "@/shared/ui/radio.tsx?raw";
import selectSource from "@/shared/ui/select.tsx?raw";
import inlineEditSource from "@/shared/ui/inline-edit.tsx?raw";
import inlineConfirmSource from "@/shared/ui/inline-confirm.tsx?raw";
import holdSource from "@/shared/ui/hold-to-confirm.tsx?raw";
import recorderSource from "@/shared/ui/shortcut-recorder.tsx?raw";
import { ThemeToggle, type ThemeToggleMode } from "@skriuw/shared/components/theme-toggle";
import themeToggleSource from "@skriuw/shared/components/theme-toggle?raw";
import { Variant, type Story } from "@skriuw/storybook-shell";

type Density = "compact" | "comfortable" | "spacious";

const DENSITIES: readonly SelectOption<Density>[] = [
  { value: "compact", label: "Compact", group: "Layout" },
  { value: "comfortable", label: "Comfortable", detail: "Default", group: "Layout" },
  { value: "spacious", label: "Spacious", group: "Layout" },
];

function ThemeToggleDemo({ modes }: { modes: readonly ThemeToggleMode[] }) {
  const [value, setValue] = useState<ThemeToggleMode>("light");
  return <ThemeToggle modes={modes} value={value} onChange={setValue} />;
}

function SelectDemo() {
  const [value, setValue] = useState<Density>("comfortable");
  return <Select label="Density" value={value} options={DENSITIES} onChange={setValue} />;
}

function RadioDemo() {
  const [value, setValue] = useState("light");
  return (
    <>
      {["light", "dark", "system"].map((option) => (
        <label key={option} className="flex items-center gap-2 text-[13px]">
          <Radio name="scheme" checked={value === option} onChange={() => setValue(option)} />
          {option}
        </label>
      ))}
    </>
  );
}

type RenameVariant = "entity" | "reference";

const RENAME_VARIANTS: Record<
  RenameVariant,
  { className: string; inputClassName: string; idle: string }
> = {
  entity: {
    className: "-ml-1.5 px-0",
    inputClassName: "text-[19px] font-[650] tracking-[-0.02em]",
    idle: "-ml-1 rounded-md px-1 text-left text-[19px] font-[650] tracking-[-0.02em]",
  },
  reference: {
    className: "gap-0 px-0 py-0",
    inputClassName: "ml-0 py-0.5",
    idle: "py-1 text-left text-[13px]",
  },
};

function InlineEditDemo({ variant, initial }: { variant: RenameVariant; initial: string }) {
  const [title, setTitle] = useState(initial);
  const [editing, setEditing] = useState(false);
  const config = RENAME_VARIANTS[variant];
  return (
    <div className="flex w-80 min-w-0">
      {editing ? (
        <InlineEdit
          className={config.className}
          inputClassName={config.inputClassName}
          defaultValue={title}
          ariaLabel={`Rename ${title}`}
          onSubmit={(value) => {
            setTitle(value.trim() || title);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button
          type="button"
          className={`cursor-text ${config.idle}`}
          onClick={() => setEditing(true)}
        >
          {title}
        </button>
      )}
    </div>
  );
}

/** Mirrors the markup of `RenameInput` in features/sidebar/sidebar-row.tsx, which is not exported. */
function SidebarRenameDemo() {
  const [title, setTitle] = useState("Weekly review");
  const [editing, setEditing] = useState(false);
  const row =
    "relative flex h-[34px] w-64 items-center overflow-hidden rounded-lg border px-3 text-left text-xs font-medium";
  if (!editing) {
    return (
      <button
        type="button"
        className={`${row} border-transparent text-foreground/60 hover:bg-muted hover:text-foreground/85`}
        onDoubleClick={() => setEditing(true)}
      >
        {title}
      </button>
    );
  }
  return (
    <div className={`${row} border-border bg-muted text-foreground`}>
      <input
        autoFocus
        aria-label={`Rename ${title}`}
        className="m-0 h-[18px] w-full border-none bg-transparent p-0 text-xs font-medium text-foreground caret-foreground outline-none selection:bg-primary/30"
        defaultValue={title}
        onFocus={(event) => event.currentTarget.setSelectionRange(title.length, title.length)}
        onBlur={(event) => {
          setTitle(event.currentTarget.value.trim() || title);
          setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setEditing(false);
        }}
      />
    </div>
  );
}

function ShortcutRecorderDemo() {
  const [combo, setCombo] = useState("mod+k");
  const defaultCombo = useRef("mod+k");
  return (
    <ShortcutRecorder
      value={combo}
      isDefault={combo === defaultCombo.current}
      aria-label="Open command palette"
      onRecord={(next) => {
        if (next === "mod+w") return "Reserved by the window manager";
        setCombo(next);
        return null;
      }}
      onReset={() => setCombo(defaultCombo.current)}
    />
  );
}

export const controlStories: Story[] = [
  {
    id: "button",
    usage: `import { Button } from "@/shared/ui/button";

<Button variant="primary" onClick={save}>Save</Button>
<Button variant="danger" disabled={!selected}>Delete</Button>`,
    api: [{ source: buttonSource, type: "Props", label: "Button", file: "shared/ui/button.tsx" }],
    group: "Controls",
    title: "Button",
    render: () => (
      <>
        <Variant label="Variants">
          <Button>Default</Button>
          <Button variant="primary">Primary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="dangerFilled">Danger filled</Button>
        </Variant>
        <Variant label="Disabled">
          <Button disabled>Default</Button>
          <Button variant="primary" disabled>
            Primary
          </Button>
        </Variant>
      </>
    ),
  },
  {
    id: "checkbox-radio",
    usage: `import { Checkbox } from "@/shared/ui/checkbox";
import { Radio } from "@/shared/ui/radio";

<label>
  <Checkbox checked={pinned} onChange={(event) => setPinned(event.target.checked)} /> Pinned
</label>
<label>
  <Radio name="scheme" checked={scheme === "dark"} onChange={() => setScheme("dark")} /> Dark
</label>`,
    api: [
      { source: checkboxSource, type: "Props", label: "Checkbox", file: "shared/ui/checkbox.tsx" },
      { source: radioSource, type: "Props", label: "Radio", file: "shared/ui/radio.tsx" },
    ],
    group: "Controls",
    title: "Checkbox + Radio",
    render: () => (
      <>
        <Variant label="Checkbox">
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox defaultChecked /> checked
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox /> unchecked
          </label>
          <label className="flex items-center gap-2 text-[13px] opacity-60">
            <Checkbox disabled /> disabled
          </label>
        </Variant>
        <Variant label="Radio group">
          <RadioDemo />
        </Variant>
      </>
    ),
  },
  {
    id: "select",
    usage: `import { Select, type SelectOption } from "@/shared/ui/select";

const OPTIONS: readonly SelectOption<Density>[] = [
  { value: "compact", label: "Compact", group: "Layout" },
  { value: "comfortable", label: "Comfortable", detail: "Default", group: "Layout" },
];

<Select label="Density" value={density} options={OPTIONS} onChange={setDensity} />`,
    api: [
      { source: selectSource, type: "Props", label: "Select", file: "shared/ui/select.tsx" },
      {
        source: selectSource,
        type: "SelectOption",
        label: "SelectOption",
        file: "shared/ui/select.tsx",
      },
    ],
    group: "Controls",
    title: "Select",
    render: () => (
      <Variant label="Grouped with detail">
        <SelectDemo />
      </Variant>
    ),
  },
  {
    id: "inline-edit",
    usage: `import { InlineEdit } from "@/shared/ui/inline-edit";

{editing ? (
  <InlineEdit
    defaultValue={title}
    ariaLabel={\`Rename \${title}\`}
    onSubmit={(value) => rename(value)}
    onCancel={() => setEditing(false)}
  />
) : (
  <button type="button" onClick={() => setEditing(true)}>{title}</button>
)}`,
    api: [
      {
        source: inlineEditSource,
        type: "Props",
        label: "InlineEdit",
        file: "shared/ui/inline-edit.tsx",
      },
    ],
    group: "Controls",
    title: "InlineEdit",
    description:
      "Enter or blur commits, Escape cancels. Each variant uses the exact classes its caller passes.",
    render: () => (
      <>
        <Variant label="Entity heading (features/references/entity-view.tsx) — click">
          <InlineEditDemo variant="entity" initial="Ada Lovelace" />
        </Variant>
        <Variant label="Reference panel row (features/references/reference-panel.tsx) — click">
          <InlineEditDemo variant="reference" initial="project-alpha" />
        </Variant>
        <Variant label="Sidebar tree rename (not InlineEdit: borderless input in a bordered row) — double-click">
          <SidebarRenameDemo />
        </Variant>
      </>
    ),
  },
  {
    id: "inline-confirm",
    usage: `import { InlineConfirm } from "@/shared/ui/inline-confirm";

<InlineConfirm
  message="Delete this note?"
  confirmLabel="Delete"
  onConfirm={deleteNote}
  renderIdle={(arm) => <Button variant="danger" onClick={arm}>Delete note</Button>}
/>`,
    api: [
      {
        source: inlineConfirmSource,
        type: "Props",
        label: "InlineConfirm",
        file: "shared/ui/inline-confirm.tsx",
      },
    ],
    group: "Controls",
    title: "InlineConfirm",
    render: () => (
      <>
        {(["inline", "stacked"] as const).map((placement) => (
          <Variant key={placement} label={placement}>
            <InlineConfirm
              confirmLabel="Delete"
              message="Delete this note?"
              messagePlacement={placement}
              onConfirm={() => showToast({ message: "Deleted" })}
              renderIdle={(arm) => (
                <Button variant="danger" onClick={arm}>
                  Delete note
                </Button>
              )}
            />
          </Variant>
        ))}
      </>
    ),
  },
  {
    id: "hold-to-confirm",
    usage: `import { HoldToConfirm } from "@/shared/ui/hold-to-confirm";

<HoldToConfirm ariaLabel="Empty trash" onConfirm={emptyTrash} onKeyboardActivate={openConfirmDialog}>
  Empty trash
</HoldToConfirm>`,
    api: [
      {
        source: holdSource,
        type: "Props",
        label: "HoldToConfirm",
        file: "shared/ui/hold-to-confirm.tsx",
      },
    ],
    group: "Controls",
    title: "HoldToConfirm",
    description: "Press and hold to fill; a quick tap shows a hint instead of acting.",
    render: () => (
      <HoldToConfirm
        ariaLabel="Empty trash"
        onConfirm={() => showToast({ message: "Trash emptied" })}
        onKeyboardActivate={() => showToast({ message: "Keyboard activate" })}
        className="rounded-md border border-border px-4 py-2 text-[13px]"
      >
        Empty trash
      </HoldToConfirm>
    ),
  },
  {
    id: "shortcut-recorder",
    usage: `import { ShortcutRecorder } from "@/shared/ui/shortcut-recorder";

<ShortcutRecorder
  value={combo}
  isDefault={combo === DEFAULT_COMBO}
  aria-label="Open command palette"
  onRecord={(next) => (isReserved(next) ? "Reserved by the window manager" : (setCombo(next), null))}
  onReset={() => setCombo(DEFAULT_COMBO)}
/>`,
    api: [
      {
        source: recorderSource,
        type: "Props",
        label: "ShortcutRecorder",
        file: "shared/ui/shortcut-recorder.tsx",
      },
    ],
    group: "Controls",
    title: "ShortcutRecorder",
    description: "Try mod+w to see the rejection message.",
    render: () => <ShortcutRecorderDemo />,
  },
  {
    id: "theme-toggle",
    usage: `import { ThemeToggle } from "@skriuw/shared/components/theme-toggle";

<ThemeToggle value={resolved} onChange={select} />
<ThemeToggle modes={["light", "dark", "system"]} value={mode} onChange={setMode} />`,
    api: [
      {
        source: themeToggleSource,
        type: "ThemeToggleProps",
        label: "ThemeToggle",
        file: "packages/shared/src/components/theme-toggle.tsx",
      },
    ],
    group: "Controls",
    title: "Theme toggle",
    render: () => (
      <>
        <Variant label="Light / dark">
          <ThemeToggleDemo modes={["light", "dark"]} />
        </Variant>
        <Variant label="With system">
          <ThemeToggleDemo modes={["light", "dark", "system"]} />
        </Variant>
      </>
    ),
  },
];
