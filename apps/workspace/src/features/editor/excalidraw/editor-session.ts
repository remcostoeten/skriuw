let openEditors = 0;

/**
 * @name trackExcalidrawEditor
 * @description Records that a drawing editor is open until the returned
 * function runs. An open editor holds its own copy of the scene and would
 * overwrite a change made elsewhere on its next commit.
 * @example
 * useEffect(() => trackExcalidrawEditor(), []);
 */
export function trackExcalidrawEditor(): () => void {
  openEditors += 1;
  return () => {
    openEditors -= 1;
  };
}

/**
 * @name excalidrawEditorIsOpen
 * @description Whether a drawing editor is open in this window.
 * @example
 * if (excalidrawEditorIsOpen()) refuse("Close the drawing editor first.");
 */
export function excalidrawEditorIsOpen(): boolean {
  return openEditors > 0;
}
