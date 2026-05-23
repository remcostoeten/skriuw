import { NotesLayoutShell } from "./notes-layout-shell";

type NotesLayoutProps = {
	initialActiveFileId?: string | null;
	initialUserScopeId?: string | null;
};

export function NotesLayout({ initialActiveFileId, initialUserScopeId }: NotesLayoutProps = {}) {
	return (
		<NotesLayoutShell
			initialActiveFileId={initialActiveFileId ?? null}
			initialUserScopeId={initialUserScopeId ?? null}
		/>
	);
}
