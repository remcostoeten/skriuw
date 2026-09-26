import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import type { Story } from "./story";

/**
 * One typographic entry. The specimen is rendered with `className`/`style` (optionally inside `wrap`)
 * and its computed font values are read back from the browser, so the catalog shows what the CSS
 * actually resolves to rather than a copied number.
 */
export type TypeEntry = {
  name: string;
  /** Where the entry is used, shown under its name. */
  description?: string;
  className?: string;
  style?: CSSProperties;
  /** Element the specimen renders as (default `"p"`; styles often need `"h1"`, `"code"`, …). */
  as?: ElementType;
  /** Puts the specimen inside the ancestors its CSS selectors expect. */
  wrap?: (specimen: ReactNode) => ReactNode;
  /** Overrides the specimen text for this entry. */
  sample?: string;
};

export type TypographySpec = {
  /** Typefaces, shown as a pangram, character set and optional weights. */
  families?: readonly (TypeEntry & { weights?: readonly number[] })[];
  /** Type scale, shown as one line each. */
  sizes?: readonly TypeEntry[];
  /** Line heights, shown as a wrapped paragraph each. */
  lineHeights?: readonly TypeEntry[];
  /** Named text styles (headings, code, captions…). */
  styles?: readonly TypeEntry[];
  /** Default specimen text. */
  sample?: string;
  /** Paragraph used for line heights. */
  paragraph?: string;
};

type Section = "families" | "sizes" | "lineHeights" | "styles";

type StoryOptions = {
  group?: string;
  idPrefix?: string;
  titles?: Partial<Record<Section, string>>;
  descriptions?: Partial<Record<Section, string>>;
};

const DEFAULT_SAMPLE = "The quick brown fox jumps over the lazy dog";
const DEFAULT_PARAGRAPH =
  "Typography carries most of an interface. Line height decides whether a paragraph reads as one calm block or a stack of separate lines, and it matters most once text wraps across several rows like this one does.";
const CHARACTER_SET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789 !?&@#%()[]{}<>/*+=-_.,:;'\"";

const DEFAULT_TITLES: Record<Section, string> = {
  families: "Font families",
  sizes: "Type scale",
  lineHeights: "Line heights",
  styles: "Text styles",
};

const DEFAULT_DESCRIPTIONS: Record<Section, string> = {
  families: "Every typeface in use. Values below each specimen are read from the rendered element.",
  sizes:
    "Font sizes from smallest to largest, with the computed size, line height, weight and tracking.",
  lineHeights: "The same paragraph at each line height.",
  styles: "Named text styles as they render in place.",
};

type Metrics = {
  family: string;
  size: string;
  lineHeight: string;
  weight: string;
  tracking: string;
};

function readMetrics(element: Element): Metrics {
  const style = getComputedStyle(element);
  const tracking = style.letterSpacing === "normal" ? "0" : style.letterSpacing;
  const lineHeight =
    style.lineHeight === "normal"
      ? "normal"
      : `${style.lineHeight} (${ratio(style.lineHeight, style.fontSize)})`;
  return {
    family: style.fontFamily,
    size: style.fontSize,
    lineHeight,
    weight: style.fontWeight,
    tracking,
  };
}

function ratio(lineHeight: string, fontSize: string) {
  const value = Number.parseFloat(lineHeight) / Number.parseFloat(fontSize);
  return Number.isFinite(value) ? `×${Math.round(value * 100) / 100}` : "";
}

function useMetrics(dependency?: unknown) {
  const ref = useRef<HTMLElement>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let cancelled = false;
    function measure() {
      if (!cancelled && element) setMetrics(readMetrics(element));
    }
    measure();
    void document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
    };
  }, [dependency]);

  return { ref, metrics };
}

type Tools = {
  text: string;
  size: number | null;
};

const TOOL_SIZES = { min: 10, max: 64 } as const;

function useTools(): [Tools, (patch: Partial<Tools>) => void] {
  const [tools, setTools] = useState<Tools>({ text: "", size: null });
  return [tools, (patch) => setTools((current) => ({ ...current, ...patch }))];
}

function Toolbar({
  tools,
  onChange,
  placeholder,
  sizeLabel,
  defaultSize,
  children,
}: {
  tools: Tools;
  onChange: (patch: Partial<Tools>) => void;
  placeholder: string;
  sizeLabel?: string;
  defaultSize?: number;
  children?: ReactNode;
}) {
  const inputClass =
    "h-7 rounded-md border border-border/60 bg-muted/40 px-2 text-[12px] text-foreground outline-none focus-visible:border-foreground/40";
  return (
    <div className="sticky top-0 z-10 -mx-1 mb-2 flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/95 px-1 py-2 backdrop-blur">
      <input
        type="text"
        aria-label="Sample text"
        placeholder={placeholder}
        value={tools.text}
        onChange={(event) => onChange({ text: event.target.value })}
        className={`${inputClass} min-w-0 flex-1 basis-56`}
      />
      {sizeLabel && defaultSize ? (
        <label className="flex h-7 items-center gap-2 text-[12px] text-muted-foreground">
          {sizeLabel}
          <input
            type="range"
            min={TOOL_SIZES.min}
            max={TOOL_SIZES.max}
            value={tools.size ?? defaultSize}
            onChange={(event) => onChange({ size: Number(event.target.value) })}
            className="w-28"
          />
          <span className="w-9 font-mono text-[11px] tabular-nums text-foreground/80">
            {tools.size ?? defaultSize}px
          </span>
        </label>
      ) : null}
      {children}
      {tools.text || tools.size !== null ? (
        <button
          type="button"
          onClick={() => onChange({ text: "", size: null })}
          className="h-7 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}

function Segmented<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-7 rounded-md bg-muted/40 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`rounded-[5px] px-2 text-[12px] ${
            option.value === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MetricList({
  metrics,
  fields,
}: {
  metrics: Metrics | null;
  fields: readonly (keyof Metrics)[];
}) {
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
      {fields.map((field) => (
        <div key={field} className="contents">
          <dt className="opacity-70">{field}</dt>
          <dd className="m-0 min-w-0 truncate text-foreground/80" title={metrics?.[field]}>
            {metrics ? metrics[field] : "…"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Row({
  entry,
  metrics,
  fields,
  children,
}: {
  entry: TypeEntry;
  metrics: Metrics | null;
  fields: readonly (keyof Metrics)[];
  children: ReactNode;
}) {
  return (
    <section
      data-toc={entry.name}
      tabIndex={-1}
      className="grid scroll-mt-16 gap-x-6 gap-y-2 border-b border-border/60 py-4 outline-none last:border-b-0 md:grid-cols-[12rem_minmax(0,1fr)]"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="m-0 text-[13px] font-medium text-foreground">{entry.name}</h3>
        {entry.description ? (
          <p className="m-0 text-[12px] leading-snug text-muted-foreground">{entry.description}</p>
        ) : null}
        <MetricList metrics={metrics} fields={fields} />
      </div>
      <div className="min-w-0 overflow-x-auto">{children}</div>
    </section>
  );
}

type SpecimenProps = {
  entry: TypeEntry;
  text: string;
  fields: readonly (keyof Metrics)[];
  overrides?: CSSProperties;
  nowrap?: boolean;
  after?: ReactNode;
};

function Specimen({ entry, text, fields, overrides, nowrap, after }: SpecimenProps) {
  const { ref, metrics } = useMetrics(overrides?.fontSize);
  const Element = entry.as ?? "p";
  const specimen = (
    <Element
      ref={ref}
      className={entry.className}
      style={{
        margin: 0,
        whiteSpace: nowrap ? "pre" : "pre-line",
        ...entry.style,
        ...overrides,
      }}
    >
      {text}
    </Element>
  );

  return (
    <Row entry={entry} metrics={metrics} fields={fields}>
      {entry.wrap ? entry.wrap(specimen) : specimen}
      {after}
    </Row>
  );
}

function Lines({
  entry,
  lines,
}: {
  entry: TypeEntry;
  lines: readonly { key: string; label?: string; text: string; style: CSSProperties }[];
}) {
  const Element = entry.as ?? "p";
  const content = (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-dashed border-border/60 pt-3">
      {lines.map((line) => (
        <div key={line.key} className="flex min-w-0 items-baseline gap-3">
          {line.label ? (
            <span className="w-8 shrink-0 font-mono text-[11px] text-muted-foreground">
              {line.label}
            </span>
          ) : null}
          <Element
            className={entry.className}
            style={{ margin: 0, whiteSpace: "pre-line", ...entry.style, ...line.style }}
          >
            {line.text}
          </Element>
        </div>
      ))}
    </div>
  );
  return <>{entry.wrap ? entry.wrap(content) : content}</>;
}

type FamilyView = "specimens" | "compare";

const FAMILY_VIEWS = [
  { value: "specimens", label: "Specimens" },
  { value: "compare", label: "Compare" },
] as const;

/** Typefaces with a pangram, the character set and each listed weight; `Compare` lines them up on one sample. */
export function FontFamilies({ spec }: { spec: TypographySpec }) {
  const [tools, setTools] = useTools();
  const [view, setView] = useState<FamilyView>("specimens");
  const sample = spec.sample ?? DEFAULT_SAMPLE;
  const text = tools.text || sample;
  const defaultSize = view === "compare" ? 20 : 24;
  const size = tools.size ?? defaultSize;
  return (
    <div>
      <Toolbar
        tools={tools}
        onChange={setTools}
        placeholder={sample}
        sizeLabel="Size"
        defaultSize={defaultSize}
      >
        <Segmented label="View" value={view} options={FAMILY_VIEWS} onChange={setView} />
      </Toolbar>
      {spec.families?.map((family) => (
        <Specimen
          key={family.name}
          entry={family}
          text={text}
          fields={view === "compare" ? ["family"] : ["family", "weight", "tracking"]}
          overrides={{ fontSize: `${size}px`, lineHeight: 1.3 }}
          nowrap={view === "compare"}
          after={
            view === "specimens" ? (
              <Lines
                entry={{ ...family, sample: undefined }}
                lines={[
                  {
                    key: "charset",
                    text: CHARACTER_SET,
                    style: { fontSize: "14px", lineHeight: 1.6 },
                  },
                  ...(family.weights ?? []).map((weight) => ({
                    key: String(weight),
                    label: String(weight),
                    text,
                    style: { fontSize: "16px", lineHeight: 1.4, fontWeight: weight },
                  })),
                ]}
              />
            ) : null
          }
        />
      ))}
    </div>
  );
}

/** One line per size, largest last. */
export function TypeScale({ spec }: { spec: TypographySpec }) {
  const [tools, setTools] = useTools();
  const sample = spec.sample ?? DEFAULT_SAMPLE;
  return (
    <div>
      <Toolbar tools={tools} onChange={setTools} placeholder={sample} />
      {spec.sizes?.map((size) => (
        <Specimen
          key={size.name}
          entry={size}
          text={tools.text || sample}
          fields={["size", "lineHeight", "weight", "tracking"]}
          nowrap
        />
      ))}
    </div>
  );
}

/** The same paragraph at each line height. */
export function LineHeights({ spec }: { spec: TypographySpec }) {
  const [tools, setTools] = useTools();
  const paragraph = spec.paragraph ?? DEFAULT_PARAGRAPH;
  const size = tools.size ?? 16;
  return (
    <div>
      <Toolbar
        tools={tools}
        onChange={setTools}
        placeholder={paragraph}
        sizeLabel="Size"
        defaultSize={16}
      />
      {spec.lineHeights?.map((lineHeight) => (
        <Specimen
          key={lineHeight.name}
          entry={lineHeight}
          text={tools.text || paragraph}
          fields={["lineHeight", "size"]}
          overrides={{ maxWidth: "62ch", fontSize: `${size}px` }}
        />
      ))}
    </div>
  );
}

/** Named text styles rendered in place. */
export function TextStyles({ spec }: { spec: TypographySpec }) {
  const [tools, setTools] = useTools();
  const sample = spec.sample ?? DEFAULT_SAMPLE;
  return (
    <div>
      <Toolbar tools={tools} onChange={setTools} placeholder={sample} />
      {spec.styles?.map((style) => (
        <Specimen
          key={style.name}
          entry={style}
          text={tools.text || (style.sample ?? sample)}
          fields={["size", "lineHeight", "weight", "tracking", "family"]}
        />
      ))}
    </div>
  );
}

const SECTIONS: readonly {
  key: Section;
  slug: string;
  Component: (props: { spec: TypographySpec }) => ReactNode;
}[] = [
  { key: "families", slug: "fonts", Component: FontFamilies },
  { key: "sizes", slug: "type-scale", Component: TypeScale },
  { key: "lineHeights", slug: "line-heights", Component: LineHeights },
  { key: "styles", slug: "text-styles", Component: TextStyles },
];

/** One story per non-empty section of `spec`. */
export function typographyStories(spec: TypographySpec, options: StoryOptions = {}): Story[] {
  const { group = "Typography", idPrefix = "typography" } = options;
  return SECTIONS.filter(({ key }) => (spec[key]?.length ?? 0) > 0).map(
    ({ key, slug, Component }) => ({
      id: `${idPrefix}-${slug}`,
      group,
      title: options.titles?.[key] ?? DEFAULT_TITLES[key],
      description: options.descriptions?.[key] ?? DEFAULT_DESCRIPTIONS[key],
      render: () => <Component spec={spec} />,
    }),
  );
}
