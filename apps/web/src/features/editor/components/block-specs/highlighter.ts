import type { HighlighterCore } from "shiki/core";

let hlPromise: Promise<HighlighterCore> | null = null;
const loadedLangs = new Set<string>();

const langLoaders: Record<string, () => Promise<unknown>> = {
	typescript: () => import("shiki/langs/typescript.mjs"),
	javascript: () => import("shiki/langs/javascript.mjs"),
	tsx: () => import("shiki/langs/tsx.mjs"),
	jsx: () => import("shiki/langs/jsx.mjs"),
	json: () => import("shiki/langs/json.mjs"),
	bash: () => import("shiki/langs/bash.mjs"),
	python: () => import("shiki/langs/python.mjs"),
	html: () => import("shiki/langs/html.mjs"),
	css: () => import("shiki/langs/css.mjs"),
	markdown: () => import("shiki/langs/markdown.mjs"),
	sql: () => import("shiki/langs/sql.mjs"),
};

function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plainCodeHtml(code: string): string {
	return `<pre class="shiki" style="color:hsl(var(--pcb-fg))"><code>${escapeHtml(code)}</code></pre>`;
}

async function getHighlighter(): Promise<HighlighterCore> {
	if (!hlPromise) {
		hlPromise = (async () => {
			const [{ createHighlighterCore }, { createOnigurumaEngine }, wasm, theme] =
				await Promise.all([
					import("shiki/core"),
					import("shiki/engine/oniguruma"),
					import("shiki/wasm"),
					import("shiki/themes/github-dark-default.mjs"),
				]);
			return createHighlighterCore({
				themes: [theme],
				langs: [],
				engine: createOnigurumaEngine(wasm),
			});
		})();
		// A rejected `hlPromise` must not stick — one transient chunk/wasm load
		// failure would otherwise permanently disable highlighting for the whole
		// session. Clear the cache on failure so the next call retries.
		hlPromise.catch(() => {
			hlPromise = null;
		});
	}
	return hlPromise;
}

export async function highlight(code: string, lang: string): Promise<string> {
	try {
		const hl = await getHighlighter();
		const target = langLoaders[lang] ? lang : "text";
		if (target !== "text" && !loadedLangs.has(target)) {
			const mod = (await langLoaders[target]()) as { default: unknown };
			await hl.loadLanguage(mod.default as never);
			loadedLangs.add(target);
		}
		return hl.codeToHtml(code, {
			lang: target,
			theme: "github-dark-default",
		});
	} catch {
		// Never leave a code block unrendered: fall back to plain, escaped text so
		// the block still shows its contents even when Shiki fails to load.
		return plainCodeHtml(code);
	}
}
