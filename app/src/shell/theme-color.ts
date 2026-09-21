import type { RendererStore } from "@skriuw/renderer-core/store/types";

const META_NAME = "theme-color";

type StyleSource = {
  getPropertyValue: (property: string) => string;
};

/**
 * Resolves the palette's chrome colour into a `theme-color` value. The
 * toolbars and tab bar paint with the sidebar token, and that is what meets
 * the status bar and the installed window's title bar, so the platform chrome
 * follows it. Skriuw ships ten palettes and lets the user switch at runtime,
 * so nothing here is frozen into the manifest.
 */
export function themeColorFrom(style: StyleSource): string | null {
  const chrome = style.getPropertyValue("--sidebar-background").trim();
  const background = chrome || style.getPropertyValue("--background").trim();
  return background ? `hsl(${background})` : null;
}

export function bindThemeColor(store: RendererStore, root: HTMLElement): () => void {
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${META_NAME}"]`);
  if (!meta) {
    return () => {};
  }
  function apply(): void {
    const color = themeColorFrom(getComputedStyle(root));
    if (color && meta) {
      meta.content = color;
    }
  }
  apply();
  return store.subscribe((state) => state.settings.theme, apply);
}
