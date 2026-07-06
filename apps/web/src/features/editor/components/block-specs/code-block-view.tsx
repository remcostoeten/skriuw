import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { noop } from "@/shared/lib/noop";
import { highlight } from "./highlighter";

export const LANGUAGES = [
	{ label: "TypeScript", value: "typescript" },
	{ label: "JavaScript", value: "javascript" },
	{ label: "TSX", value: "tsx" },
	{ label: "JSX", value: "jsx" },
	{ label: "JSON", value: "json" },
	{ label: "Bash", value: "bash" },
	{ label: "Python", value: "python" },
	{ label: "HTML", value: "html" },
	{ label: "CSS", value: "css" },
	{ label: "Markdown", value: "markdown" },
	{ label: "SQL", value: "sql" },
	{ label: "Plain text", value: "text" },
] as const;

export const LANGUAGE_VALUES = LANGUAGES.map((l) => l.value) as unknown as readonly [
	string,
	...string[],
];

export interface CodeBlockData {
	props: { language: string; title: string };
}

export interface CodeBlockEditor {
	updateBlock: (
		block: unknown,
		update: { type: "procode"; props: { language?: string; title?: string } },
	) => void;
}

export function CodeBlockView({
	block,
	contentRef,
	editor,
}: {
	block: CodeBlockData;
	contentRef: (node: HTMLElement | null) => void;
	editor: CodeBlockEditor;
}) {
	const [copied, setCopied] = useState(false);
	const [highlighted, setHighlighted] = useState<string>("");
	const codeRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const el = codeRef.current;
		if (!el) {
			return;
		}
		let cancelled = false;
		let raf = 0;
		const run = () => {
			const text = el.textContent;
			highlight(text, block.props.language).then((html) => {
				if (!cancelled) {
					setHighlighted(html);
				}
			});
		};
		const schedule = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(run);
		};
		schedule();
		const mo = new MutationObserver(schedule);
		mo.observe(el, { characterData: true, childList: true, subtree: true });
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
			mo.disconnect();
		};
	}, [block.props.language]);

	async function onCopy() {
		const text = codeRef.current?.textContent ?? "";
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 1400);
		} catch {
			noop();
		}
	}

	return (
		<div className="pro-code-block" data-language={block.props.language}>
			<div className="pro-code-head" contentEditable={false}>
				<span className="pro-code-head-start">
					<select
						className="pro-code-lang"
						value={block.props.language}
						onChange={(e) =>
							editor.updateBlock(block, {
								props: { language: e.target.value },
								type: "procode",
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
							const next = (e.currentTarget.textContent ?? "").trim();
							if (next !== block.props.title) {
								editor.updateBlock(block, {
									props: { title: next },
									type: "procode",
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
}
