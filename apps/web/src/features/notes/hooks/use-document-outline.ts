"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type TOutlineHeading = {
	key: string;
	blockId: string | null;
	level: number;
	text: string;
};

type Params = {
	noteId: string | null | undefined;
	mode: "raw" | "block";
	content: string;
};

const HEADING_SELECTOR = '[data-content-type="heading"]';
const MAX_HEADING_LEVEL = 6;

function getEditorRoot(): HTMLElement | null {
	if (typeof document === "undefined") return null;
	const pane = document.querySelector<HTMLElement>('[data-editor-pane="primary"]');
	const scope = pane ?? document.body;
	return scope.querySelector<HTMLElement>(".blocknote-wrapper") ?? scope;
}

function readDomHeadings(root: HTMLElement): TOutlineHeading[] {
	const nodes = root.querySelectorAll<HTMLElement>(HEADING_SELECTOR);
	const headings: TOutlineHeading[] = [];
	nodes.forEach((node, index) => {
		const text = node.textContent?.trim() ?? "";
		if (text.length === 0) return;
		const container = node.closest<HTMLElement>("[data-id]");
		const blockId = container?.getAttribute("data-id") ?? null;
		const levelAttr = node.getAttribute("data-level");
		const level = levelAttr ? Number(levelAttr) : 1;
		headings.push({
			key: blockId ?? `dom-${index}`,
			blockId,
			level: Number.isFinite(level) ? level : 1,
			text,
		});
	});
	return headings;
}

function parseMarkdownHeadings(markdown: string): TOutlineHeading[] {
	const headings: TOutlineHeading[] = [];
	const lines = markdown.split("\n");
	let inFence = false;

	lines.forEach((line, index) => {
		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
			return;
		}
		if (inFence) return;
		const match = line.match(/^(#{1,6})\s+(.*\S)\s*$/);
		if (!match) return;
		const level = Math.min(match[1].length, MAX_HEADING_LEVEL);
		headings.push({
			key: `md-${index}`,
			blockId: null,
			level,
			text: match[2].replace(/#+\s*$/, "").trim(),
		});
	});

	return headings.filter((heading) => heading.text.length > 0);
}

function headingsEqual(a: TOutlineHeading[], b: TOutlineHeading[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((heading, index) => {
		const other = b[index];
		return (
			heading.blockId === other.blockId &&
			heading.level === other.level &&
			heading.text === other.text
		);
	});
}

export function useDocumentOutline({ noteId, mode, content }: Params): {
	headings: TOutlineHeading[];
	scrollToHeading: (heading: TOutlineHeading) => void;
} {
	const [domHeadings, setDomHeadings] = useState<TOutlineHeading[]>([]);

	const markdownHeadings = useMemo(() => parseMarkdownHeadings(content), [content]);

	useEffect(() => {
		if (!noteId || mode !== "block") {
			setDomHeadings([]);
			return;
		}

		let frame = 0;
		let root: HTMLElement | null = null;
		let observer: MutationObserver | null = null;

		const scan = () => {
			const nextRoot = getEditorRoot();
			if (nextRoot && nextRoot !== root) {
				root = nextRoot;
				observer?.disconnect();
				observer = new MutationObserver(schedule);
				observer.observe(root, {
					subtree: true,
					childList: true,
					characterData: true,
					attributes: true,
					attributeFilter: ["data-level", "data-content-type"],
				});
			}
			const next = root ? readDomHeadings(root) : [];
			setDomHeadings((current) => (headingsEqual(current, next) ? current : next));
		};

		const schedule = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(scan);
		};

		schedule();

		return () => {
			cancelAnimationFrame(frame);
			observer?.disconnect();
		};
	}, [noteId, mode]);

	const headings = mode === "block" ? domHeadings : markdownHeadings;

	const scrollToHeading = useCallback((heading: TOutlineHeading) => {
		const root = getEditorRoot();
		if (!root) return;

		if (heading.blockId) {
			const container = root.querySelector<HTMLElement>(
				`[data-id="${CSS.escape(heading.blockId)}"]`,
			);
			const target = container?.querySelector<HTMLElement>(HEADING_SELECTOR) ?? container;
			target?.scrollIntoView({ behavior: "smooth", block: "center" });
			return;
		}

		const candidates = Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR));
		const target = candidates.find((node) => node.textContent?.trim() === heading.text);
		target?.scrollIntoView({ behavior: "smooth", block: "center" });
	}, []);

	return { headings, scrollToHeading };
}
