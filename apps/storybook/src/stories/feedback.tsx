import { useState } from "react";
import { ICON_NAMES } from "@skriuw/icons";
import { AppIcon } from "@/shared/icons/app-icon";
import { showToast } from "@/shared/ui/toast";
import { Tooltip } from "@/shared/ui/tooltip";
import { KeyCaps } from "@/shared/ui/key-caps";
import { Collapse } from "@/shared/ui/collapse";
import { SectionLabel, SectionToggle } from "@/shared/ui/section-header";
import tooltipSource from "@/shared/ui/tooltip.tsx?raw";
import toastSource from "@/shared/ui/toast.tsx?raw";
import keyCapsSource from "@/shared/ui/key-caps.tsx?raw";
import sectionSource from "@/shared/ui/section-header.tsx?raw";
import collapseSource from "@/shared/ui/collapse.tsx?raw";
import { plainButton, Variant, type Story } from "@skriuw/storybook-shell";

const SIDES = ["top", "right", "bottom", "left"] as const;

function CollapseDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div className="w-72">
      <SectionToggle title="Pinned" open={open} onToggle={() => setOpen((value) => !value)} />
      <Collapse open={open}>
        <ul className="px-2 py-1 text-[13px]">
          <li>Weekly review</li>
          <li>Reading list</li>
          <li>Ideas</li>
        </ul>
      </Collapse>
    </div>
  );
}

export const feedbackStories: Story[] = [
  {
    id: "tooltip",
    usage: `import { Tooltip } from "@/shared/ui/tooltip";

<Tooltip label="Search notes" shortcut="Ctrl K" side="bottom">
  <button type="button" aria-label="Search">…</button>
</Tooltip>`,
    api: [
      {
        source: tooltipSource,
        type: "TooltipProps",
        label: "Tooltip",
        file: "shared/ui/tooltip.tsx",
      },
    ],
    group: "Feedback",
    title: "Tooltip",
    description:
      "Delay on first open, instant within 300ms of the previous close. Escape, scroll and resize dismiss.",
    render: () => (
      <>
        <Variant label="Sides">
          {SIDES.map((side) => (
            <Tooltip key={side} label={`Opens ${side}`} side={side}>
              <button type="button" className={plainButton}>
                {side}
              </button>
            </Tooltip>
          ))}
        </Variant>
        <Variant label="Shortcut and truncation">
          <Tooltip label="Search notes" shortcut="Ctrl K">
            <button type="button" className={plainButton}>
              with shortcut
            </button>
          </Tooltip>
          <Tooltip
            label="A long label that has to truncate because tooltips cap their width at 280 pixels"
            shortcut="Ctrl Shift P"
          >
            <button type="button" className={plainButton}>
              long label
            </button>
          </Tooltip>
        </Variant>
        <Variant label="Skip-delay across a rail">
          {ICON_NAMES.slice(0, 8).map((name) => (
            <Tooltip key={name} label={name} side="bottom">
              <button
                type="button"
                aria-label={name}
                className="grid size-8 place-items-center rounded-md hover:bg-muted"
              >
                <AppIcon name={name} />
              </button>
            </Tooltip>
          ))}
        </Variant>
        <Variant label="Collision (hug the viewport edge)">
          <Tooltip label="Flips or shifts to stay inside the viewport" side="left">
            <button type="button" className={plainButton}>
              side=left near the sidebar
            </button>
          </Tooltip>
        </Variant>
      </>
    ),
  },
  {
    id: "toast",
    usage: `import { showToast, ToastHost } from "@/shared/ui/toast";

// once, near the app root
<ToastHost />

showToast({
  message: "Moved 3 notes to trash",
  action: { label: "Undo", run: restoreNotes },
});`,
    api: [
      {
        source: toastSource,
        type: "ToastRequest",
        label: "showToast(request)",
        file: "shared/ui/toast.tsx",
      },
      {
        source: toastSource,
        type: "ToastAction",
        label: "request.action",
        file: "shared/ui/toast.tsx",
      },
      { source: toastSource, type: "HostProps", label: "ToastHost", file: "shared/ui/toast.tsx" },
    ],
    group: "Feedback",
    title: "Toast",
    description: "Bottom-center stack of three. Ctrl/Cmd+Shift+Z runs the latest toast's action.",
    render: () => (
      <Variant label="Variants">
        <button
          type="button"
          className={plainButton}
          onClick={() => showToast({ message: "Note saved" })}
        >
          plain
        </button>
        <button
          type="button"
          className={plainButton}
          onClick={() =>
            showToast({
              message: "Sync paused",
              description: "The service rejected the checkpoint. Retrying in 30 seconds.",
            })
          }
        >
          with description
        </button>
        <button
          type="button"
          className={plainButton}
          onClick={() =>
            showToast({
              message: "Moved 3 notes to trash",
              action: { label: "Undo", run: () => showToast({ message: "Restored" }) },
            })
          }
        >
          with undo action
        </button>
        <button
          type="button"
          className={plainButton}
          onClick={() => showToast({ message: "Short-lived", durationMs: 1_500 })}
        >
          1.5s
        </button>
        <button
          type="button"
          className={plainButton}
          onClick={() =>
            ["One", "Two", "Three", "Four"].forEach((word) =>
              showToast({ message: `Toast ${word}` }),
            )
          }
        >
          overflow stack (4)
        </button>
      </Variant>
    ),
  },
  {
    id: "key-caps",
    usage: `import { KeyCaps } from "@/shared/ui/key-caps";

<KeyCaps keys={["Ctrl", "K"]} />`,
    api: [
      { source: keyCapsSource, type: "Props", label: "KeyCaps", file: "shared/ui/key-caps.tsx" },
    ],
    group: "Feedback",
    title: "KeyCaps",
    render: () => (
      <Variant label="Combos">
        <KeyCaps keys={["Ctrl", "K"]} />
        <KeyCaps keys={["⌘", "⇧", "Z"]} />
        <KeyCaps keys={["G", "G"]} />
      </Variant>
    ),
  },
  {
    id: "section-header",
    usage: `import { Collapse } from "@/shared/ui/collapse";
import { SectionLabel, SectionToggle } from "@/shared/ui/section-header";

<SectionLabel title="Recent" count={12} />

<SectionToggle title="Pinned" open={open} onToggle={() => setOpen((value) => !value)} />
<Collapse open={open}>{children}</Collapse>`,
    api: [
      {
        source: sectionSource,
        type: "SectionLabelProps",
        label: "SectionLabel",
        file: "shared/ui/section-header.tsx",
      },
      {
        source: sectionSource,
        type: "SectionToggleProps",
        label: "SectionToggle",
        file: "shared/ui/section-header.tsx",
      },
      { source: collapseSource, type: "Props", label: "Collapse", file: "shared/ui/collapse.tsx" },
    ],
    group: "Feedback",
    title: "Section header + Collapse",
    render: () => (
      <>
        <Variant label="Label with count">
          <div className="w-72">
            <SectionLabel title="Recent" count={12} />
          </div>
        </Variant>
        <Variant label="Toggle drives Collapse">
          <CollapseDemo />
        </Variant>
      </>
    ),
  },
];
