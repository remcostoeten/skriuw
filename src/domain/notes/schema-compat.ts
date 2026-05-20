type PostgrestLikeError = {
	code?: string | null;
	message?: string | null;
};

export function isMissingNotesTagsColumnError(
	error: PostgrestLikeError | null | undefined,
): boolean {
	return error?.code === "42703" && error.message?.includes("notes.tags") === true;
}
