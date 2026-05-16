import { createCodeBlockSpec, type CodeBlockOptions } from "@blocknote/core";

const SUPPORTED_LANGUAGES: NonNullable<CodeBlockOptions["supportedLanguages"]> = {
  text: { name: "Plain text", aliases: ["plaintext", "txt", "none"] },
  javascript: { name: "JavaScript", aliases: ["js"] },
  typescript: { name: "TypeScript", aliases: ["ts"] },
  tsx: { name: "TSX", aliases: ["jsx"] },
  json: { name: "JSON" },
  markdown: { name: "Markdown", aliases: ["md", "mdx"] },
  bash: { name: "Bash", aliases: ["sh", "shell", "zsh"] },
  css: { name: "CSS" },
  html: { name: "HTML" },
  python: { name: "Python", aliases: ["py"] },
  sql: { name: "SQL" },
  yaml: { name: "YAML", aliases: ["yml"] },
};

export function createSyntaxHighlightedCodeBlockSpec() {
  return createCodeBlockSpec({
    defaultLanguage: "text",
    supportedLanguages: SUPPORTED_LANGUAGES,
    indentLineWithTab: true,
    createHighlighter: async () => {
      const { createHighlighterCore } = await import("shiki/core");
      const { createOnigurumaEngine } = await import("shiki/engine/oniguruma");
      const [theme, javascript, typescript, tsx, jsx, json, markdown, bash, css, html, python, sql, yaml, wasm] =
        await Promise.all([
          import("shiki/themes/github-dark-default.mjs"),
          import("shiki/langs/javascript.mjs"),
          import("shiki/langs/typescript.mjs"),
          import("shiki/langs/tsx.mjs"),
          import("shiki/langs/jsx.mjs"),
          import("shiki/langs/json.mjs"),
          import("shiki/langs/markdown.mjs"),
          import("shiki/langs/bash.mjs"),
          import("shiki/langs/css.mjs"),
          import("shiki/langs/html.mjs"),
          import("shiki/langs/python.mjs"),
          import("shiki/langs/sql.mjs"),
          import("shiki/langs/yaml.mjs"),
          import("shiki/wasm"),
        ]);

      return createHighlighterCore({
        themes: [theme],
        langs: [javascript, typescript, tsx, jsx, json, markdown, bash, css, html, python, sql, yaml],
        engine: createOnigurumaEngine(wasm),
      });
    },
  });
}
