export const TOGGLE_EDITOR_MODE_EVENT = "skriuw:toggle-editor-mode";

export function requestEditorModeToggle() {
	window.dispatchEvent(new Event(TOGGLE_EDITOR_MODE_EVENT));
}
