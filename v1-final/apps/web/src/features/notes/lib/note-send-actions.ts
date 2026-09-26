export interface LinkShareHandlers {
	copyShareLink: () => Promise<void>;
	shareLinkOnX: () => Promise<void>;
	shareLinkOnDiscord: () => Promise<void>;
	shareLinkWhatsApp: () => Promise<void>;
	shareLinkTelegram: () => Promise<void>;
	shareLinkSms: () => Promise<void>;
	shareLinkEmail: () => Promise<void>;
}

export type LinkShareActionId =
	| "copy"
	| "x"
	| "discord"
	| "whatsapp"
	| "telegram"
	| "sms"
	| "email";

export interface LinkShareActionSpec {
	id: LinkShareActionId;
	label: string;
	busyLabel?: string;
	icon: "copy" | "x" | "discord" | "whatsapp" | "telegram" | "sms" | "email";
	closeAfter?: boolean;
}

export const LINK_SHARE_ACTIONS: LinkShareActionSpec[] = [
	{
		busyLabel: "Publishing link…",
		closeAfter: false,
		icon: "copy",
		id: "copy",
		label: "Copy link",
	},
	{ icon: "x", id: "x", label: "Share on X" },
	{ closeAfter: false, icon: "discord", id: "discord", label: "Share on Discord" },
	{ icon: "whatsapp", id: "whatsapp", label: "WhatsApp link" },
	{ icon: "telegram", id: "telegram", label: "Telegram link" },
	{ icon: "sms", id: "sms", label: "SMS link" },
	{ icon: "email", id: "email", label: "Email link" },
];

export function runLinkShareAction(
	id: LinkShareActionId,
	handlers: LinkShareHandlers,
): void | Promise<void> {
	switch (id) {
		case "copy": {
			return handlers.copyShareLink();
		}
		case "x": {
			return handlers.shareLinkOnX();
		}
		case "discord": {
			return handlers.shareLinkOnDiscord();
		}
		case "whatsapp": {
			return handlers.shareLinkWhatsApp();
		}
		case "telegram": {
			return handlers.shareLinkTelegram();
		}
		case "sms": {
			return handlers.shareLinkSms();
		}
		case "email": {
			return handlers.shareLinkEmail();
		}
	}
}

export function linkShareActionLabel(action: LinkShareActionSpec, isBusy: boolean): string {
	if (isBusy && action.busyLabel) {
		return action.busyLabel;
	}
	return action.label;
}

export type NoteSendMenuHandlers = LinkShareHandlers & {
	shareNative: () => Promise<void>;
	saveAsFile: () => Promise<void>;
	shareAppleNotes: () => Promise<void>;
	shareWhatsApp: () => void;
	shareSms: () => void;
	copyMarkdown: () => Promise<void>;
	shareEmail: () => void;
	downloadMarkdown: () => void;
};
