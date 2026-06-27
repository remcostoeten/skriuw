/**
 * Invisible drag handles for the frameless desktop window. The native title bar
 * is disabled (`decorations: false`), so without an explicit `tauri-drag-region`
 * there is no way to move the window. These strips are transparent and sit only
 * over non-interactive chrome (the logo corner and the very top edge), so they
 * never swallow clicks meant for the icon rail or editor toolbar.
 */
export function WindowDragRegion() {
  return (
    <>
      <div
        data-tauri-drag-region=""
        aria-hidden="true"
        className="pointer-events-auto fixed left-0 top-0 z-50 h-11 w-14 select-none"
      />
      <div
        data-tauri-drag-region=""
        aria-hidden="true"
        className="pointer-events-auto fixed inset-x-0 top-0 z-50 h-1.5 select-none"
      />
    </>
  );
}
