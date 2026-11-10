import type { CommandPaletteItem } from "./command-palette-model";
import type { PalettePreview, PreviewLine } from "./palette-preview";
import { paletteShortcutLabel } from "./palette-shortcut-label";

type Props = {
  item: CommandPaletteItem;
  preview: PalettePreview | null;
};

const LINE_CLASS: Record<PreviewLine["tone"], string> = {
  heading: "mt-2.5 font-medium text-foreground/90 first:mt-0",
  text: "mt-1.5 first:mt-0",
  item: "mt-1 flex gap-2 first:mt-0",
};

function PreviewPage({ preview }: { preview: PalettePreview }) {
  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background px-4 pt-3.5">
      <h3 className="m-0 line-clamp-2 flex-none text-[14px] font-semibold leading-snug text-foreground">
        {preview.title}
      </h3>
      {preview.meta.length > 0 && (
        <p className="m-0 mt-1 flex-none truncate text-[11px] text-muted-foreground">
          {preview.meta.join(" · ")}
        </p>
      )}
      {preview.chips.length > 0 && (
        <p className="m-0 mt-2.5 flex flex-none flex-wrap gap-1">
          {preview.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[11px] leading-[1.4] text-foreground/75"
            >
              {chip}
            </span>
          ))}
        </p>
      )}
      <div className="palette-page-fade mt-3 min-h-0 flex-auto overflow-hidden pb-3 text-[12.5px] leading-[1.6] text-foreground/70">
        {preview.lines.length === 0 ? (
          <p className="m-0 text-muted-foreground">{preview.placeholder}</p>
        ) : (
          preview.lines.map((line, position) => (
            <p key={position} className={`m-0 ${LINE_CLASS[line.tone]}`}>
              {line.tone === "item" && (
                <span aria-hidden="true" className="flex-none text-muted-foreground">
                  •
                </span>
              )}
              <span className="line-clamp-3 min-w-0">{line.text}</span>
            </p>
          ))
        )}
      </div>
    </article>
  );
}

function PreviewCard({ item }: { item: CommandPaletteItem }) {
  const detail = item.description ?? item.hint;
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg bg-foreground/[0.03] px-5 pb-4 text-center">
      <span className="grid size-12 flex-none place-items-center rounded-xl bg-foreground/[0.07] text-[16px] font-semibold text-foreground [&>svg]:size-[22px]">
        {item.icon ?? item.label.charAt(0).toUpperCase()}
      </span>
      <h3 className="m-0 mt-3.5 text-balance text-[14px] font-semibold leading-snug text-foreground">
        {item.label}
      </h3>
      <p className="m-0 mt-1 text-[11.5px] text-muted-foreground">{item.group ?? "Actions"}</p>
      {detail && (
        <p className="m-0 mt-3 max-w-[32ch] text-pretty text-[12.5px] leading-[1.55] text-foreground/65">
          {detail}
        </p>
      )}
      {item.shortcut && (
        <kbd className="mt-4 rounded-md bg-foreground/[0.07] px-2 py-1 font-mono text-[11px] leading-none text-foreground/80">
          {paletteShortcutLabel(item.shortcut)}
        </kbd>
      )}
    </div>
  );
}

export function PalettePreviewPane({ item, preview }: Props) {
  return (
    <aside
      aria-label="Preview"
      className="palette-preview hidden min-h-0 py-2 pr-2 min-[900px]:block"
    >
      {preview ? <PreviewPage preview={preview} /> : <PreviewCard item={item} />}
    </aside>
  );
}
