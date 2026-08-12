import { extractInPage } from "../content/extract";
import { postCapture } from "../shared/api";
import { getSettings } from "../shared/storage";
import type {
	TCapturePayload,
	TExtractKind,
	TExtractResult,
	TRuntimeMessage,
} from "../shared/types";
import { enqueueCapture, flushQueue } from "./queue";

const FLUSH_ALARM = "skriuw-flush";

async function extractFromTab(tabId: number, kind: TExtractKind): Promise<TExtractResult | null> {
	const [result] = await chrome.scripting.executeScript({
		target: { tabId },
		func: extractInPage,
		args: [kind],
	});
	return (result?.result as TExtractResult | undefined) ?? null;
}

function toPayload(
	extracted: TExtractResult,
	extra?: { title?: string; tags?: string[]; parentId?: string | null },
): TCapturePayload {
	const title = extra?.title?.trim() || extracted.title;
	return {
		url: extracted.url,
		title,
		markdown: extracted.markdown,
		selection: extracted.kind === "selection",
		tags: [...new Set([...extracted.tags, ...(extra?.tags ?? [])])],
		parentId: extra?.parentId ?? null,
		source: "chrome-extension",
	};
}

async function notify(title: string, message: string): Promise<void> {
	await chrome.notifications.create({
		type: "basic",
		iconUrl: "icons/icon-128.png",
		title,
		message,
	});
}

async function clipTab(
	tabId: number,
	kind: TExtractKind,
	extra?: { title?: string; tags?: string[]; parentId?: string | null },
): Promise<{ ok: boolean; error?: string; queued?: boolean; path?: string }> {
	const extracted = await extractFromTab(tabId, kind).catch(() => null);
	if (!extracted || !extracted.markdown.trim()) {
		return { ok: false, error: "Could not read this page." };
	}

	const payload = toPayload(extracted, extra);
	if (payload.parentId === null && extra?.parentId === undefined) {
		payload.parentId = (await getSettings()).parentId;
	}
	const idempotencyKey = crypto.randomUUID();
	const outcome = await postCapture(payload, idempotencyKey);

	if (outcome.ok) {
		return { ok: true, path: outcome.data.path };
	}
	if (outcome.retryable) {
		await enqueueCapture(payload);
		return { ok: true, queued: true };
	}
	if (outcome.status === 401) {
		return { ok: false, error: "Sync key expired or revoked. Reconnect in Settings." };
	}
	return { ok: false, error: outcome.error };
}

chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: "skriuw-save-selection",
		title: "Save selection to Skriuw",
		contexts: ["selection"],
	});
	chrome.contextMenus.create({
		id: "skriuw-save-page",
		title: "Save page to Skriuw",
		contexts: ["page"],
	});
	chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (!tab?.id) return;
	const kind: TExtractKind =
		info.menuItemId === "skriuw-save-selection" ? "selection" : "article";
	const result = await clipTab(tab.id, kind);
	await notify(
		result.ok ? "Saved to Skriuw" : "Skriuw clip failed",
		result.ok
			? result.queued
				? "Offline — will retry automatically."
				: "Clip saved."
			: (result.error ?? "Unknown error."),
	);
});

chrome.commands.onCommand.addListener(async (command) => {
	if (command !== "save-page") return;
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (!tab?.id) return;
	const result = await clipTab(tab.id, "article");
	await notify(
		result.ok ? "Saved to Skriuw" : "Skriuw clip failed",
		result.ok
			? result.queued
				? "Offline — will retry automatically."
				: "Clip saved."
			: (result.error ?? "Unknown error."),
	);
});

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === FLUSH_ALARM) {
		void flushQueue(Date.now());
	}
});

chrome.runtime.onMessage.addListener((message: TRuntimeMessage, _sender, sendResponse) => {
	if (message.type === "clip") {
		(async () => {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (!tab?.id) {
				sendResponse({ ok: false, error: "No active tab." });
				return;
			}
			sendResponse(await clipTab(tab.id, message.kind, message.extra));
		})();
		return true;
	}
	if (message.type === "extract") {
		(async () => {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (!tab?.id) {
				sendResponse(null);
				return;
			}
			sendResponse(await extractFromTab(tab.id, message.kind).catch(() => null));
		})();
		return true;
	}
	return false;
});
