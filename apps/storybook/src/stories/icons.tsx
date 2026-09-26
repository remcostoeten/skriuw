import { useState, type ReactNode } from "react";
import { GLYPH_NAMES, ICON_NAMES } from "@skriuw/icons";
import { AppIcon } from "@/shared/icons/app-icon";
import { CalendarDaysIcon } from "@/shared/icons/animated/calendar-days";
import { FolderOpenIcon } from "@/shared/icons/animated/folder-open";
import { TagsIcon } from "@/shared/icons/animated/tags";
import { FluentIcon } from "@/shared/icons/static";
import { showToast } from "@/shared/ui/toast";
import { iconName, iconSource, iconSvg, iconUsage, type IconSubject } from "@storybook/icon-export";
import appIconSource from "@/shared/icons/app-icon.tsx?raw";
import fluentSource from "@/shared/icons/static.tsx?raw";
import calendarDaysSource from "@/shared/icons/animated/calendar-days.tsx?raw";
import { Variant, type Story } from "@skriuw/storybook-shell";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-1";

function AppIconGallery() {
  const [size, setSize] = useState(20);
  return (
    <>
      <SizeSlider size={size} onChange={setSize} />
      <div className={GRID}>
        {ICON_NAMES.map((name) => (
          <IconTile key={name} subject={{ kind: "app", name }} size={size}>
            <AppIcon name={name} size={size} />
          </IconTile>
        ))}
      </div>
    </>
  );
}

function GlyphGallery() {
  const [size, setSize] = useState(16);
  const [query, setQuery] = useState("");
  const glyphs = GLYPH_NAMES.filter((glyph) => glyph.includes(query.trim().toLowerCase()));
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <SizeSlider size={size} onChange={setSize} />
        <input
          className="h-8 rounded-md border border-border bg-transparent px-2 text-[13px]"
          placeholder={`Filter ${GLYPH_NAMES.length} glyphs`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className={GRID}>
        {glyphs.map((glyph) => (
          <IconTile key={glyph} subject={{ kind: "glyph", name: glyph }} size={size}>
            <FluentIcon glyph={glyph} size={size} />
          </IconTile>
        ))}
      </div>
    </>
  );
}

const COPY_ACTIONS = [
  { label: "JSX", title: "Copy React usage", build: iconUsage },
  { label: "TSX", title: "Copy standalone component source", build: iconSource },
  { label: "SVG", title: "Copy raw SVG", build: iconSvg },
  { label: "Name", title: "Copy name", build: iconName },
] as const;

function copy(label: string, text: string) {
  navigator.clipboard.writeText(text).then(
    () => showToast({ message: `Copied ${label}`, durationMs: 1_500 }),
    () => showToast({ message: "Clipboard is unavailable" }),
  );
}

function IconTile({
  subject,
  size,
  children,
}: {
  subject: IconSubject;
  size: number;
  children: ReactNode;
}) {
  return (
    <div className="group flex flex-col items-center gap-2 rounded-md p-3 hover:bg-muted">
      <button
        type="button"
        aria-label={subject.name}
        className="grid min-h-8 place-items-center px-4"
      >
        {children}
      </button>
      <span className="w-full truncate text-center text-[11px] text-muted-foreground">
        {subject.name}
      </span>
      <div className="flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        {COPY_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            title={action.title}
            className="rounded border border-border px-1 font-mono text-[9px] text-muted-foreground hover:bg-background hover:text-foreground"
            onClick={() => copy(action.title.replace("Copy ", ""), action.build(subject, size))}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SizeSlider({ size, onChange }: { size: number; onChange: (size: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
      size {size}px
      <input
        type="range"
        min={12}
        max={48}
        value={size}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export const iconStories: Story[] = [
  {
    id: "app-icon",
    usage: `import { AppIcon } from "@/shared/icons/app-icon";

<AppIcon name="search" size={16} />`,
    api: [
      { source: appIconSource, type: "Props", label: "AppIcon", file: "shared/icons/app-icon.tsx" },
    ],
    group: "Icons",
    title: "AppIcon",
    description:
      "Action-named icons from @skriuw/icons. Hover a tile to play its motion (toggle in the toolbar).",
    render: () => <AppIconGallery />,
  },
  {
    id: "glyphs",
    usage: `import { SearchIcon } from "@/shared/icons/static";

<SearchIcon size={16} />`,
    api: [
      {
        source: fluentSource,
        type: "GlyphProps",
        label: "FluentIcon",
        file: "shared/icons/static.tsx",
      },
      {
        source: fluentSource,
        type: "IconProps",
        label: "IconProps",
        file: "shared/icons/static.tsx",
      },
    ],
    group: "Icons",
    title: "Fluent glyphs",
    render: () => <GlyphGallery />,
  },
  {
    id: "motion-icons",
    api: [
      {
        source: calendarDaysSource,
        type: "CalendarDaysIconProps",
        label: "CalendarDaysIcon",
        file: "shared/icons/animated/calendar-days.tsx",
      },
    ],
    group: "Icons",
    title: "Legacy motion icons",
    render: () => (
      <Variant label="Hover to animate">
        <CalendarDaysIcon size={24} />
        <FolderOpenIcon size={24} />
        <TagsIcon size={24} />
      </Variant>
    ),
  },
];
