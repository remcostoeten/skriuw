import type { HistoryBranchRole } from "@/features/notes/components/note-history-graph";

export function getHistoryBranchRoles<T extends { reasonKind: string }>(
	items: T[],
): HistoryBranchRole[] {
	const forkIndex = items.findIndex((item, index) => index > 0 && item.reasonKind === "restore");

	if (forkIndex === -1) {
		return items.map((_, index) => (index === 0 ? "head" : "trunk"));
	}

	return items.map((_, index) => {
		if (index === 0) {
			return "head";
		}
		if (index < forkIndex) {
			return "branch";
		}
		if (index === forkIndex) {
			return "fork";
		}
		return "trunk";
	});
}

export function findRestoredSourceIndex<T extends { content: string }>(
	items: T[],
	forkIndex: number,
): number | null {
	if (forkIndex === -1) {
		return null;
	}

	const currentContent = items[0]?.content;
	if (!currentContent) {
		return null;
	}

	for (let index = forkIndex + 1; index < items.length; index += 1) {
		if (items[index].content === currentContent) {
			return index;
		}
	}

	return null;
}
