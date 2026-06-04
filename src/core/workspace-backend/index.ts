export { serverBackend } from "./server-backend";
export {
	createLocalBackend,
	mergeSeedWithGuestNotes,
	mergeSeedWithGuestFolders,
	resetGuestStorage,
	GUEST_SIGNUP_PROMPT_EVENT,
} from "./local-backend";
export {
	WorkspaceBackendProvider,
	useWorkspaceBackend,
	useIsGuestWorkspace,
} from "./context";
export type { WorkspaceBackend } from "./types";
