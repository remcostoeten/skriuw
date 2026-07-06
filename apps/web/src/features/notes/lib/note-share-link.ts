import { resolveClientShareUrl } from "@/features/notes/lib/note-share-export";
import type { TNoteShareState } from "@/domain/sharing/models";

export const FIRST_SHARE_PUBLISH_MESSAGE =
	"This creates a public link that anyone can open. Continue?";

type ConfirmFn = (message: string) => boolean;

function defaultConfirm(message: string): boolean {
	if (typeof window === "undefined") return false;
	return window.confirm(message);
}

export function confirmFirstSharePublish(confirm: ConfirmFn = defaultConfirm): boolean {
	return confirm(FIRST_SHARE_PUBLISH_MESSAGE);
}

export async function resolveShareUrlForAction(input: {
	existing: Pick<TNoteShareState, "path" | "url"> | null | undefined;
	confirmPublish: () => boolean;
	publish: () => Promise<TNoteShareState>;
}): Promise<string | null> {
	if (input.existing) {
		return resolveClientShareUrl(input.existing.path, input.existing.url);
	}
	if (!input.confirmPublish()) return null;

	const state = await input.publish();
	return resolveClientShareUrl(state.path, state.url);
}
