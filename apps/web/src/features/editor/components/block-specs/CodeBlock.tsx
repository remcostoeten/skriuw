import { createExtension } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { highlight } from "./highlighter";
import "./code-block.css";

const LANGUAGES = [
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "tsx", label: "TSX" },
  { value: "jsx", label: "JSX" },
  { value: "json", label: "JSON" },
  { value: "bash", label: "Bash" },
  { value: "python", label: "Python" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "markdown", label: "Markdown" },
  { value: "sql", label: "SQL" },
  { value: "text", label: "Plain text" },
] as const;

const LANGUAGE_VALUES = LANGUAGES.map((l) => l.value) as unknown as readonly [
  string,
  ...string[],
];

const validLanguages = new Set(LANGUAGE_VALUES);

// biome-ignore lint/suspicious/noExplicitAny: runtime-compatible extension factory
const procodeExtensions: any[] = [
  createExtension({
    key: "procode-input-rule",
    inputRules: [
      {
        find: /^```(\S+)?(\s+.*)?\s$/,
        replace: ({ match }: { match: RegExpExecArray }) => {
          const raw = match[1]?.toLowerCase();
          const language = raw && validLanguages.has(raw) ? raw : "typescript";
          const title = raw && !validLanguages.has(raw)
            ? ((match[1] ?? "") + (match[2] ?? "")).trim()
            : (match[2] ?? "").trim();
          return { type: "procode", props: { language, title } };
        },
      },
    ],
  }),
];

export const CodeBlock = createReactBlockSpec(
  {
    type: "procode",
    propSchema: {
      language: { default: "typescript" as string, values: LANGUAGE_VALUES },
      title: { default: "" },
    },
    content: "inline",
  },
  {
    render: ({ block, contentRef, editor }) => {
      const [copied, setCopied] = useState(false);
      const [highlighted, setHighlighted] = useState<string>("");
      const codeRef = useRef<HTMLElement | null>(null);

      useEffect(() => {
        const el = codeRef.current;
        if (!el) return;
        let cancelled = false;
        let raf = 0;
        const run = () => {
          const text = el.innerText;
          highlight(text, block.props.language).then((html) => {
            if (!cancelled) setHighlighted(html);
          });
        };
        const schedule = () => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(run);
        };
        schedule();
        const mo = new MutationObserver(schedule);
        mo.observe(el, { childList: true, subtree: true, characterData: true });
        return () => {
          cancelled = true;
          cancelAnimationFrame(raf);
          mo.disconnect();
        };
      }, [block.props.language]);

      const onCopy = async () => {
        const text = codeRef.current?.innerText ?? "";
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* noop */
        }
      };

      return (
        <div className="pro-code-block" data-language={block.props.language}>
          <div className="pro-code-head" contentEditable={false}>
            <span className="pro-code-head-start">
              <select
                className="pro-code-lang"
                value={block.props.language}
                onChange={(e) =>
                  editor.updateBlock(block, {
                    type: "procode",
                    props: { language: e.target.value },
                  })
                }
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <span className="pro-code-title-sep"> </span>
              <span
                className="pro-code-title"
                role="textbox"
                contentEditable
                suppressContentEditableWarning
                aria-label="Code block title"
                data-placeholder="filename"
                onBlur={(e) => {
                  const next = (e.currentTarget.innerText ?? "").trim();
                  if (next !== block.props.title) {
                    editor.updateBlock(block, {
                      type: "procode",
                      props: { title: next },
                    });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLElement).blur();
                  }
                }}
              >
                {block.props.title}
              </span>
            </span>
            <button
              type="button"
              className="pro-code-copy"
              data-copied={copied ? "true" : "false"}
              onClick={onCopy}
              aria-label={copied ? "Copied" : "Copy code"}
              title={copied ? "Copied" : "Copy"}
            >
              <span className="pro-code-copy-icon pro-code-copy-copy">
                <Copy size={14} />
              </span>
              <span className="pro-code-copy-icon pro-code-copy-check">
                <Check size={14} />
              </span>
            </button>
          </div>
          <div className="pro-code-body">
            <div
              className="pro-code-highlight"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
            <pre className="pro-code-pre">
              <code
                ref={(node) => {
                  codeRef.current = node;
                  contentRef(node);
                }}
                className="pro-code-code"
                spellCheck={false}
              />
            </pre>
          </div>
        </div>
      );
    },
  },
  procodeExtensions,
);
