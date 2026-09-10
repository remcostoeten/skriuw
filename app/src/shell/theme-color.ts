import type { RendererStore } from "@/store/types";

const META_NAME = "theme-color";

type StyleSource = {
  getPropertyValue: (property: string) => string;
};

/**
 * Resolves the palette's window background into a `theme-color` value. Skriuw
 * ships ten palettes and lets the user switch at runtime, so the installed
 * status bar and task-switcher chrome follow the same token the shell paints
 * with instead of a colour frozen into the manifest.
 */
export function themeColorFrom(style: StyleSource): string | null {
  const background = style.getPropertyValue("--background").trim();
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
  return store.subscribe((state) => state.settings, apply);
}
