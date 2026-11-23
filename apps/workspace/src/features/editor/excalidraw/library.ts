import type * as ExcalidrawLibrary from "@excalidraw/excalidraw";

type ExcalidrawModule = typeof ExcalidrawLibrary;

let loading: Promise<ExcalidrawModule> | null = null;

/**
 * @name loadExcalidraw
 * @description Loads the Excalidraw library and its stylesheet once, pointing
 * its font loader at the fonts bundled with the app. Only a drawing block
 * with content, or opening the drawing editor, calls this, so notes without
 * drawings never pay for the library.
 * @example
 * const { exportToSvg } = await loadExcalidraw();
 */
export function loadExcalidraw(): Promise<ExcalidrawModule> {
  if (loading === null) {
    Object.assign(window, {
      EXCALIDRAW_ASSET_PATH: new URL("excalidraw-assets/", document.baseURI).href,
    });
    loading = Promise.all([
      import("@excalidraw/excalidraw"),
      import("@excalidraw/excalidraw/index.css"),
    ]).then(([module]) => module);
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}
