"use client";

import { useCallback, useMemo } from "react";
import {
	buildLinkShareMessage,
	buildNoteSharePayload,
	canShareNoteFiles,
	canUseNativeShare,
	copyTextToClipboard,
	downloadNoteMarkdown,
	isAppleSharePlatform,
	openDiscordShare,
	openEmailShare,
	openEmailShareWithLink,
	openWhatsAppShare,
	openWhatsAppShareWithLink,
	openXShare,
	resolveClientShareUrl,
	shareNoteAsFile,
	shareNoteNatively,
	shareNoteToAppleNotes,
	type NoteSharePayload,
} from "@/features/notes/lib/note-share-export";
import { useNoteSharing } from "@/features/sharing/hooks/use-note-sharing";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import type { NoteFile } from "@/types/notes";

type NoteSendSource = Pick<NoteFile, "id" | "name" | "content"> | null;

export function useNoteSend(note: NoteSendSource) {
	const noteId = note?.id ?? "";
	const payload = useMemo(
		() => (note ? buildNoteSharePayload(note) : null),
		[note],
	);
	const { shareQuery, publish } = useNoteSharing(noteId || undefined);

	const canNativeShare = canUseNativeShare();
	const canSaveAsFile = payload ? canShareNoteFiles(payload) : false;
	const showAppleNotes = canNativeShare && isAppleSharePlatform();
	const isLinkShareBusy = publish.isPending || shareQuery.isFetching;
	const cachedShareUrl = useMemo(() => {
		const share = shareQuery.data;
		if (!share) return null;
		return resolveClientShareUrl(share.path, share.url);
	}, [shareQuery.data]);

	const ensureShareUrl = useCallback(async (): Promise<string | null> => {
		if (!noteId || !payload) return null;

		const existing = shareQuery.data;
		if (existing) {
			return resolveClientShareUrl(existing.path, existing.url);
		}

		try {
			const state = await publish.mutateAsync({
				noteId,
				viewOnce: false,
				expiry: { kind: "never" },
				showAuthor: false,
			});
			return resolveClientShareUrl(state.path, state.url);
		} catch {
			return null;
		}
	}, [noteId, payload, publish, shareQuery.data]);

	const runWithPayload = useCallback(
		(action: (payload: NoteSharePayload) => void | Promise<void>) => {
			if (!payload) return;
			void action(payload);
		},
		[payload],
	);

	const runWithShareUrl = useCallback(
		async (action: (url: string, payload: NoteSharePayload) => void | Promise<void>) => {
			if (!payload) return;
			const url = cachedShareUrl ?? (await ensureShareUrl());
			if (!url) return;
			await action(url, payload);
		},
		[cachedShareUrl, ensureShareUrl, payload],
	);

	const prefetchShareLink = useCallback(async () => {
		await ensureShareUrl();
	}, [ensureShareUrl]);

	const shareNative = useCallback(async () => {
		if (!payload) return;
		const result = await shareNoteNatively(payload);
		if (result === "shared") {
			triggerNativeFeedback("success");
		}
	}, [payload]);

	const saveAsFile = useCallback(async () => {
		if (!payload) return;
		const result = await shareNoteAsFile(payload);
		if (result === "shared") {
			triggerNativeFeedback("success");
		}
	}, [payload]);

	const shareAppleNotes = useCallback(async () => {
		if (!payload) return;
		const result = await shareNoteToAppleNotes(payload);
		if (result === "shared") {
			triggerNativeFeedback("success");
		}
	}, [payload]);

	const shareEmail = useCallback(() => {
		runWithPayload((value) => {
			openEmailShare(value);
			triggerNativeFeedback("selection");
		});
	}, [runWithPayload]);

	const shareWhatsApp = useCallback(() => {
		runWithPayload((value) => {
			openWhatsAppShare(value);
			triggerNativeFeedback("selection");
		});
	}, [runWithPayload]);

	const downloadMarkdown = useCallback(() => {
		runWithPayload((value) => {
			downloadNoteMarkdown(value);
			triggerNativeFeedback("success");
		});
	}, [runWithPayload]);

	const copyShareLink = useCallback(async () => {
		await runWithShareUrl(async (url) => {
			const copied = await copyTextToClipboard(url);
			if (copied) {
				triggerNativeFeedback("success");
			}
		});
	}, [runWithShareUrl]);

	const shareLinkOnX = useCallback(async () => {
		await runWithShareUrl((url, value) => {
			openXShare(url, value.title);
			triggerNativeFeedback("selection");
		});
	}, [runWithShareUrl]);

	const shareLinkOnDiscord = useCallback(async () => {
		await runWithShareUrl(async (url, value) => {
			const result = await openDiscordShare(value.title, url);
			if (result === "shared" || result === "copied") {
				triggerNativeFeedback("success");
			}
		});
	}, [runWithShareUrl]);

	const shareLinkWhatsApp = useCallback(async () => {
		await runWithShareUrl((url, value) => {
			openWhatsAppShareWithLink(value.title, url);
			triggerNativeFeedback("selection");
		});
	}, [runWithShareUrl]);

	const shareLinkEmail = useCallback(async () => {
		await runWithShareUrl((url, value) => {
			openEmailShareWithLink(value.title, url);
			triggerNativeFeedback("selection");
		});
	}, [runWithShareUrl]);

	return {
		payload,
		cachedShareUrl,
		canNativeShare,
		canSaveAsFile,
		showAppleNotes,
		isLinkShareBusy,
		prefetchShareLink,
		shareNative,
		saveAsFile,
		shareAppleNotes,
		shareEmail,
		shareWhatsApp,
		downloadMarkdown,
		copyShareLink,
		shareLinkOnX,
		shareLinkOnDiscord,
		shareLinkWhatsApp,
		shareLinkEmail,
	};
}
