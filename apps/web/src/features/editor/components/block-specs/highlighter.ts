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
  }
  return hlPromise;
}

export async function highlight(code: string, lang: string): Promise<string> {
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
}
