/// <reference types="vite/client" />

declare module "highlight.js/lib/languages/*" {
  import type { LanguageFn } from "highlight.js";
  const language: LanguageFn;
  export default language;
}

declare module "@remcostoeten/notifier/styles";
