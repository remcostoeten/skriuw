import type { ReactNode } from "react";
import { useStorybookConfig } from "./config";

export type PropsSource = {
  /** Component source text, imported with `?raw`. */
  source: string;
  /** Name of the props type declared in that source. */
  type: string;
  /** Heading shown above the table; defaults to the type name. */
  label?: string;
  /** File path shown in the "Source" section; defaults to `label`. */
  file?: string;
};

type PropRow = {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
};

type ParsedProps = {
  rows: PropRow[];
  inherits: string[];
};

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    const char = text[index];
    if (char === "{" || char === "(" || char === "<" || char === "[") depth++;
    if (char === "}" || char === ")" || char === ">" || char === "]") {
      if (text[index - 1] === "=" && char === ">") continue;
      depth--;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

function topLevelSplit(body: string, separator: string): string[] {
  const pieces: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index++) {
    if (body.startsWith("/*", index)) {
      const close = body.indexOf("*/", index);
      index = close < 0 ? body.length : close + 1;
      continue;
    }
    if (body.startsWith("//", index)) {
      const lineEnd = body.indexOf("\n", index);
      index = lineEnd < 0 ? body.length : lineEnd;
      continue;
    }
    const char = body[index];
    if ("{(<[".includes(char!)) depth++;
    if ("})]".includes(char!) || (char === ">" && body[index - 1] !== "=")) depth--;
    if (depth === 0 && body.startsWith(separator, index)) {
      pieces.push(body.slice(start, index));
      start = index + separator.length;
    }
  }
  pieces.push(body.slice(start));
  return pieces.map((piece) => piece.trim()).filter(Boolean);
}

function cleanJsDoc(comment: string): string {
  return comment
    .replace(/^\/\*\*|\*\/$/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .join(" ")
    .trim();
}

function defaultFor(source: string, name: string): string | undefined {
  const pattern = new RegExp(`(?:^|[{,]\\s*)${name.replace(/[^\w]/g, "")} = ([^,}\\n]+)`, "m");
  return pattern.exec(source)?.[1]?.trim();
}

function cvaVariantRows(source: string, reference: string): PropRow[] {
  const variable = /VariantProps<typeof (\w+)>/.exec(reference)?.[1];
  if (!variable) return [];
  const declaration = source.indexOf(`const ${variable} = cva(`);
  const variantsAt = source.indexOf("variants: {", declaration);
  if (declaration < 0 || variantsAt < 0) return [];
  const open = source.indexOf("{", variantsAt);
  const body = source.slice(open + 1, matchingBrace(source, open));
  const defaults = source.slice(source.indexOf("defaultVariants", variantsAt));
  return [...body.matchAll(/^\s{6}(\w+): \{/gm)].map((match) => {
    const groupOpen = open + 1 + match.index! + match[0].length - 1;
    const group = source.slice(groupOpen + 1, matchingBrace(source, groupOpen));
    const options = [...group.matchAll(/^\s{8}(\w+):/gm)].map((option) => `"${option[1]}"`);
    return {
      name: match[1]!,
      type: options.join(" | "),
      required: false,
      defaultValue: new RegExp(`${match[1]}: "(\\w+)"`).exec(defaults)?.[1]?.replace(/^|$/g, '"'),
      description: `Variant from ${variable}.`,
    };
  });
}

const NEXT_STATEMENT = /\n\s*(?:export\s|type\s|interface\s|function\s|const\s|let\s|import\s|$)/y;

function startsNextStatement(source: string, index: number): boolean {
  NEXT_STATEMENT.lastIndex = index;
  return NEXT_STATEMENT.test(source);
}

/** Reads a component's props type straight from its source so the table never drifts. */
export function parseProps(source: string, typeName: string): ParsedProps {
  const declaration = new RegExp(`type ${typeName}(?:<[^=]+>)? =`).exec(source);
  if (!declaration) return { rows: [], inherits: [] };
  let end = declaration.index + declaration[0].length;
  let depth = 0;
  while (
    end < source.length &&
    (depth > 0 || (source[end] !== ";" && !startsNextStatement(source, end)))
  ) {
    if (source[end] === "{") depth++;
    else if (source[end] === "}") depth--;
    end++;
  }
  const expression = source.slice(declaration.index + declaration[0].length, end);
  const rows: PropRow[] = [];
  const inherits: string[] = [];
  for (const part of topLevelSplit(expression, "&")) {
    if (!part.startsWith("{")) {
      const variantRows = cvaVariantRows(source, part);
      if (variantRows.length > 0) rows.push(...variantRows);
      else inherits.push(part.replace(/\s+/g, " "));
      continue;
    }
    const body = part.slice(1, part.lastIndexOf("}"));
    let pendingDoc: string | undefined;
    for (const member of topLevelSplit(body, ";")) {
      const docMatch = /^(\/\*\*[\s\S]*?\*\/)\s*/.exec(member);
      const text = docMatch ? member.slice(docMatch[0].length) : member;
      if (docMatch) pendingDoc = cleanJsDoc(docMatch[1]!);
      const field = /^("[^"]+"|[\w$]+)(\?)?:\s*([\s\S]+)$/.exec(
        text.replace(/^\/\/.*\n/gm, "").trim(),
      );
      if (!field) continue;
      const name = field[1]!.replace(/"/g, "");
      rows.push({
        name,
        type: field[3]!.replace(/\s+/g, " "),
        required: !field[2],
        defaultValue: defaultFor(source, name),
        description: pendingDoc,
      });
      pendingDoc = undefined;
    }
  }
  return { rows, inherits };
}

const TYPE_TOKEN =
  /("[^"]*"|'[^']*'|`[^`]*`)|(\b\d[\d_.]*\b)|(\b(?:string|number|boolean|void|null|undefined|never|unknown|any|readonly|typeof|keyof|true|false)\b)|(\b[A-Z][\w]*\b)|(=>|[|&<>()[\]{}:,?])/g;

const TOKEN_CLASS = [
  "text-emerald-500",
  "text-orange-500",
  "text-violet-500",
  "text-amber-500",
  "text-muted-foreground/70",
];

function TypeCode({ text }: { text: string }) {
  const pieces: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TYPE_TOKEN)) {
    if (match.index! > last) pieces.push(text.slice(last, match.index));
    const group = match.slice(1).findIndex((value) => value !== undefined);
    pieces.push(
      <span key={match.index} className={TOKEN_CLASS[group]}>
        {match[0]}
      </span>,
    );
    last = match.index! + match[0].length;
  }
  pieces.push(text.slice(last));
  return (
    <code className="font-mono text-[12px] leading-5 text-foreground/85 [overflow-wrap:anywhere]">
      {pieces}
    </code>
  );
}

function Description({ text }: { text: string }) {
  return (
    <p className="mt-1 max-w-[46ch] text-[12px] leading-[1.45] text-muted-foreground text-pretty">
      {text.split(/(`[^`]+`)/).map((piece, index) =>
        piece.startsWith("`") ? (
          <code
            key={index}
            className="rounded bg-muted px-1 py-px font-mono text-[11px] text-foreground/85"
          >
            {piece.slice(1, -1)}
          </code>
        ) : (
          piece
        ),
      )}
    </p>
  );
}

function PropsTable({ source, type, label }: PropsSource) {
  const { labels } = useStorybookConfig();
  const { rows, inherits } = parseProps(source, type);
  return (
    <div className="flex flex-col gap-3">
      <h3
        data-toc={label ?? type}
        data-toc-level="2"
        tabIndex={-1}
        className="outline-none flex scroll-mt-6 items-baseline gap-2 text-[14px] font-semibold tracking-[-0.01em]"
      >
        {label ?? type}
        <span className="font-mono text-[11px] font-normal text-muted-foreground">
          {labels.props(rows.length)}
        </span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-foreground/80">
              <th className="w-[38%] py-2.5 pr-4 font-semibold">Prop</th>
              <th className="py-2.5 pr-4 font-semibold">Type</th>
              <th className="w-[16%] py-2.5 font-semibold">Default</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.name}
                className="border-b border-border/60 align-top transition-colors hover:bg-muted/25"
              >
                <td className="py-2.5 pr-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-[12.5px] font-medium text-foreground">
                      {row.name}
                    </code>
                    {row.required && (
                      <span className="rounded-full border border-border px-1.5 text-[10px] leading-4 text-muted-foreground">
                        {labels.required}
                      </span>
                    )}
                  </div>
                  {row.description && <Description text={row.description} />}
                </td>
                <td className="py-2.5 pr-4">
                  <TypeCode text={row.type} />
                </td>
                <td className="py-2.5">
                  {row.defaultValue ? (
                    <TypeCode text={row.defaultValue} />
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
              </tr>
            ))}
            {inherits.map((parent) => (
              <tr key={parent} className="border-b border-border/60">
                <td colSpan={3} className="py-2.5 text-[12px] text-muted-foreground">
                  <span className="mr-2">{labels.alsoAccepts}</span>
                  <TypeCode text={parent} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One props table per declared type of the story's components. */
export function PropsTables({ api }: { api: readonly PropsSource[] }) {
  const { labels } = useStorybookConfig();
  return (
    <section className="mt-14 flex flex-col gap-8 border-t border-border/60 pt-10">
      <h2
        data-section="api"
        data-toc={labels.apiReference}
        data-toc-level="1"
        tabIndex={-1}
        className="outline-none scroll-mt-6 text-[18px] font-semibold tracking-[-0.015em]"
      >
        {labels.apiReference}
      </h2>
      {api.map((entry) => (
        <PropsTable key={`${entry.type}-${entry.label ?? ""}`} {...entry} />
      ))}
    </section>
  );
}
