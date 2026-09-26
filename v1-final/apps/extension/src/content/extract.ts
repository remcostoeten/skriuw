import type { TExtractKind, TExtractResult } from "../shared/types";

export function extractInPage(kind: TExtractKind): TExtractResult {
	function normalizeWhitespace(value: string): string {
		return value.replace(/\s+/g, " ").trim();
	}

	function absoluteUrl(value: string | null): string {
		if (!value) return "";
		try {
			return new URL(value, location.href).href;
		} catch {
			return value;
		}
	}

	function appendLines(target: string[], source: string[], prefix = ""): void {
		if (!source.length) return;
		if (!prefix) {
			target.push(...source);
			return;
		}
		for (const line of source) {
			target.push(`${prefix}${line}`);
		}
	}

	function inlineMarkdown(node: Node): string {
		if (node.nodeType === Node.TEXT_NODE) {
			return normalizeWhitespace(node.textContent ?? "");
		}
		if (!(node instanceof HTMLElement)) return "";

		const tag = node.tagName.toLowerCase();
		if (tag === "br") return "\n";
		if (tag === "img") {
			const src = absoluteUrl(node.getAttribute("src") ?? node.getAttribute("data-src"));
			if (!src) return "";
			const alt = normalizeWhitespace(node.getAttribute("alt") ?? "");
			return `![${alt}](${src})`;
		}

		const text = Array.from(node.childNodes)
			.map(inlineMarkdown)
			.join(" ")
			.replace(/\s+\n/g, "\n");
		const normalized = normalizeWhitespace(text);
		if (!normalized) return "";

		if (tag === "a") {
			const href = absoluteUrl(node.getAttribute("href"));
			if (!href || href.startsWith("javascript:")) return normalized;
			return `[${normalized}](${href})`;
		}
		if (tag === "strong" || tag === "b") return `**${normalized}**`;
		if (tag === "em" || tag === "i") return `_${normalized}_`;
		if (tag === "code") return `\`${normalized.replace(/`/g, "\\`")}\``;
		return normalized;
	}

	function blockMarkdown(node: Element, depth = 0): string[] {
		const tag = node.tagName.toLowerCase();
		if (["script", "style", "noscript", "svg", "canvas", "nav", "footer"].includes(tag)) {
			return [];
		}
		if (node instanceof HTMLElement && node.hidden) return [];

		if (/^h[1-6]$/.test(tag)) {
			const level = Number(tag[1]);
			const text = inlineMarkdown(node);
			return text ? [`${"#".repeat(level)} ${text}`] : [];
		}
		if (tag === "p" || tag === "figcaption") {
			const text = inlineMarkdown(node);
			return text ? [text] : [];
		}
		if (tag === "blockquote") {
			const lines: string[] = [];
			for (const child of node.children) {
				appendLines(lines, blockMarkdown(child, depth));
			}
			if (lines.length === 0) {
				const text = inlineMarkdown(node);
				return text ? [`> ${text}`] : [];
			}
			for (let i = 0; i < lines.length; i++) {
				lines[i] = `> ${lines[i]}`;
			}
			return lines;
		}
		if (tag === "pre") {
			const code = (node.textContent ?? "").trim();
			return code ? [`\`\`\`\n${code}\n\`\`\``] : [];
		}
		if (tag === "img") {
			const src = absoluteUrl(node.getAttribute("src") ?? node.getAttribute("data-src"));
			if (!src) return [];
			const alt = normalizeWhitespace(node.getAttribute("alt") ?? "");
			return [`![${alt}](${src})`];
		}
		if (tag === "ul" || tag === "ol") {
			const lines: string[] = [];
			let listIndex = 0;
			for (const child of node.children) {
				if (child.tagName.toLowerCase() !== "li") continue;

				const prefix = tag === "ol" ? `${++listIndex}.` : "-";
				const own = inlineMarkdown(child);
				if (own) {
					lines.push(`${"  ".repeat(depth)}${prefix} ${own}`);
				}

				for (const nestedChild of child.children) {
					const nestedTag = nestedChild.tagName.toLowerCase();
					if (nestedTag !== "ul" && nestedTag !== "ol") continue;
					appendLines(lines, blockMarkdown(nestedChild, depth + 1), "  ");
				}
			}
			return lines;
		}

		const childBlocks: string[] = [];
		for (const child of node.children) {
			appendLines(childBlocks, blockMarkdown(child, depth));
		}
		if (childBlocks.length > 0) return childBlocks;
		const text = inlineMarkdown(node);
		return text ? [text] : [];
	}

	function toMarkdown(root: HTMLElement): string {
		const lines: string[] = [];
		for (const line of blockMarkdown(root)) {
			const trimmed = line.trimEnd();
			if (trimmed) lines.push(trimmed);
		}
		return lines
			.join("\n\n")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}

	function pickMainElement(): HTMLElement {
		const candidates = Array.from(
			document.querySelectorAll<HTMLElement>(
				"article, main, [role='main'], .post, .entry-content, .article-content, .content",
			),
		);
		let best: HTMLElement = document.body;
		let bestLen = 0;
		for (const el of [...candidates, document.body]) {
			let paragraphs = 0;
			let blockers = 0;
			for (const child of el.querySelectorAll("p,li,pre,blockquote,nav,footer,aside")) {
				switch (child.tagName.toLowerCase()) {
					case "p":
					case "li":
					case "pre":
					case "blockquote":
						paragraphs++;
						break;
					case "nav":
					case "footer":
					case "aside":
						blockers++;
						break;
				}
			}
			const len = (el.textContent ?? "").length;
			const score = len + paragraphs * 120 - blockers * 300;
			if (score > bestLen) {
				best = el;
				bestLen = score;
			}
		}
		return best;
	}

	const selection = window.getSelection();
	const url = location.href;
	const baseTitle = document.title || url;

	if (kind === "selection" && selection && selection.toString().trim()) {
		const container = document.createElement("div");
		for (let i = 0; i < selection.rangeCount; i++) {
			container.appendChild(selection.getRangeAt(i).cloneContents());
		}
		return {
			title: baseTitle,
			url,
			markdown: toMarkdown(container) || selection.toString().trim(),
			tags: [],
			kind: "selection",
		};
	}

	const metaTitle =
		document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? baseTitle;
	const excerpt =
		document.querySelector('meta[name="description"]')?.getAttribute("content") ?? undefined;
	const byline =
		document.querySelector('meta[name="author"]')?.getAttribute("content") ??
		document.querySelector<HTMLElement>('[rel="author"], .byline, .author')?.textContent ??
		undefined;
	const keywords = document.querySelector('meta[name="keywords"]')?.getAttribute("content") ?? "";
	const tags: string[] = [];
	for (const tag of keywords.split(",")) {
		const trimmed = tag.trim();
		if (!trimmed) continue;
		tags.push(trimmed);
		if (tags.length === 10) break;
	}

	return {
		title: metaTitle,
		url,
		markdown: toMarkdown(pickMainElement()),
		excerpt,
		byline: byline ? normalizeWhitespace(byline) : undefined,
		tags,
		kind: "article",
	};
}
