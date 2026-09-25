import type { ReactNode } from "react";
import type { CodeSource } from "./code";
import type { PropsSource } from "./props-table";

export type Story = {
  /** Unique, URL-safe id; used as the location hash. */
  id: string;
  /** Sidebar section the story is listed under. */
  group: string;
  title: string;
  description?: string;
  render: () => ReactNode;
  /** Component sources whose props types become API tables below the canvas. */
  api?: readonly PropsSource[];
  /** Copy-paste example shown under "Usage". */
  usage?: string;
  /** Files shown under "Source"; defaults to the distinct sources in `api`. */
  source?: readonly CodeSource[];
};

type VariantProps = {
  label: string;
  children: ReactNode;
};

/** Labels one variant inside a story canvas. */
export function Variant({ label, children }: VariantProps) {
  return (
    <div className="flex scroll-mt-6 flex-col gap-2 outline-none" data-toc={label} tabIndex={-1}>
      <h3 className="text-[12px] font-medium text-muted-foreground">{label}</h3>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Neutral button classes for story triggers that should not borrow an app's own button styles. */
export const plainButton =
  "inline-flex h-8 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-[13px] hover:bg-muted";
