import { useQuery } from "@tanstack/react-query";
import { mobileBackend } from "@/backend/http-backend";
import type { WorkspaceBackend } from "@/backend/types";

export const syncStatusKey = ["sync", "cloud-summary"] as const;

type SyncSummaryBackend = Pick<
	WorkspaceBackend,
	"listNotes" | "listFolders" | "listJournalEntries"
>;

export async function fetchCloudSyncStatus(backend: SyncSummaryBackend = mobileBackend) {
	const [notes, folders, journalEntries] = await Promise.all([
		backend.listNotes(),
		backend.listFolders(),
		backend.listJournalEntries(),
	]);

	return {
		noteCount: notes.length,
		folderCount: folders.length,
		journalEntryCount: journalEntries.length,
	};
}

export function useCloudSyncStatus() {
	return useQuery({
		queryKey: syncStatusKey,
		queryFn: () => fetchCloudSyncStatus(),
		staleTime: 0,
	});
}
