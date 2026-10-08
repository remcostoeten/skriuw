import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { MathNodeViewDeps } from "./nodeview";
import { mathMacrosFromSettings } from "./macros";
import { cachedMathRender, renderMath } from "./render";

/**
 * @name workspaceMathRendering
 * @description Supplies math views with workspace macros and a narrow change subscription.
 * @example
 * createMathBlockNodeView(node, view, getPos, workspaceMathRendering(store));
 */
export function workspaceMathRendering(store: RendererStore): Partial<MathNodeViewDeps> {
  return {
    render: (tex, displayMode) =>
      renderMath(tex, displayMode, null, mathMacrosFromSettings(store.getState().settings)),
    cached: (tex, displayMode) =>
      cachedMathRender(tex, displayMode, mathMacrosFromSettings(store.getState().settings)),
    subscribe: (repaint) => store.subscribe((state) => state.settings.mathMacros, repaint),
  };
}
