/**
 * Window-event bus for vim ex commands (`:w`, `:q`, `:wq`, ...). Lives in its
 * own module so listeners (use-notes-layout) can subscribe without pulling the
 * ProseMirror-backed vim plugin into their bundle.
 */

export const VIM_COMMAND_EVENT = "skriuw:vim-command";

export type VimCommandDetail = { command: string };

export function dispatchVimCommand(command: string) {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent<VimCommandDetail>(VIM_COMMAND_EVENT, { detail: { command } }),
	);
}
