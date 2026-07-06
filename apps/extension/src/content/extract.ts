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
			const lines = Array.from(node.children).flatMap((child) => blockMarkdown(child, depth));
			const fallback = lines.length ? lines : [inlineMarkdown(node)].filter(Boolean);
			return fallback.map((line) => `> ${line}`);
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
			return Array.from(node.children)
				.filter((child) => child.tagName.toLowerCase() === "li")
				.flatMap((child, index) => {
					const prefix = tag === "ol" ? `${index + 1}.` : "-";
					const own = inlineMarkdown(child);
					const nested = Array.from(child.children)
						.filter((nestedChild) =>
							["ul", "ol"].includes(nestedChild.tagName.toLowerCase()),
						)
						.flatMap((nestedChild) => blockMarkdown(nestedChild, depth + 1))
						.map((line) => `  ${line}`);
					return own ? [`${"  ".repeat(depth)}${prefix} ${own}`, ...nested] : nested;
				});
		}

		const childBlocks = Array.from(node.children).flatMap((child) =>
			blockMarkdown(child, depth),
		);
		if (childBlocks.length > 0) return childBlocks;
		const text = inlineMarkdown(node);
		return text ? [text] : [];
	}

	function toMarkdown(root: HTMLElement): string {
		return blockMarkdown(root)
			.map((line) => line.trimEnd())
			.filter(Boolean)
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
			const paragraphs = el.querySelectorAll("p,li,pre,blockquote").length;
			const len = (el.textContent ?? "").length;
			const score =
				len + paragraphs * 120 - el.querySelectorAll("nav,footer,aside").length * 300;
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
	const tags = keywords
		.split(",")
		.map((tag) => tag.trim())
		.filter(Boolean)
		.slice(0, 10);

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
