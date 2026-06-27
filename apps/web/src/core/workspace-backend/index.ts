export { serverBackend } from "./server-backend";
export {
	createLocalBackend,
	mergeSeedWithGuestNotes,
	mergeSeedWithGuestFolders,
	mergeSeedWithGuestWorkspace,
	resetGuestStorage,
	GUEST_SIGNUP_PROMPT_EVENT,
} from "./local-backend";
export { createTauriBackend, isTauriRuntime, tauriInvoke, tauriChannel } from "./tauri-backend";
export type { TauriChannel } from "./tauri-backend";
export { recordGuestGraphExplore } from "./guest-graph-engagement";
export {
	WorkspaceBackendProvider,
	useWorkspaceBackend,
	useIsGuestWorkspace,
	useWorkspaceCapabilities,
} from "./context";
export type { WorkspaceBackend, WorkspaceCapabilities } from "./types";
export { WorkspaceCapabilityError } from "./capability-error";
