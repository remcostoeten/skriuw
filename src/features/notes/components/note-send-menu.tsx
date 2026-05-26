"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
	Copy,
	Download,
	FileDown,
	Link2,
	Loader2,
	Mail,
	MessageCircle,
	NotebookPen,
	Share2,
} from "lucide-react";
import {
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@/shared/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/shared/ui/sheet";
import { useNoteSend } from "@/features/notes/hooks/use-note-send";
import { cn } from "@/shared/lib/utils";
import type { NoteFile } from "@/types/notes";

type NoteSendSource = Pick<NoteFile, "id" | "name" | "content">;

const MOBILE_ACTION_CLASS =
	"flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-foreground transition-colors active:bg-foreground/5 disabled:opacity-40";
const MOBILE_SECTION_LABEL =
	"px-4 pb-2 pt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42";

function XIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
		</svg>
	);
}

function DiscordIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
			<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.946 2.419-2.157 2.419z" />
		</svg>
	);
}

function MobileActionDivider() {
	return <div className="mx-4 h-px bg-foreground/8" />;
}

function MobileActionButton({
	icon,
	label,
	disabled,
	onClick,
}: {
	icon: ReactNode;
	label: string;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button type="button" disabled={disabled} onClick={onClick} className={MOBILE_ACTION_CLASS}>
			{icon}
			<span className="truncate">{label}</span>
		</button>
	);
}

function useNoteSendMenu(note: NoteSendSource, prefetch = false) {
	const send = useNoteSend(note);

	useEffect(() => {
		if (prefetch) {
			void send.prefetchShareLink();
		}
	}, [prefetch, send.prefetchShareLink]);

	return send;
}

function NoteSendMobilePanel({
	note,
	onClose,
	prefetch = true,
}: {
	note: NoteSendSource;
	onClose?: () => void;
	prefetch?: boolean;
}) {
	const {
		canNativeShare,
		canSaveAsFile,
		showAppleNotes,
		isLinkShareBusy,
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
	} = useNoteSendMenu(note, prefetch);

	const runAction = (action: () => void | Promise<void>, closeAfter = true) => {
		void (async () => {
			await action();
			if (closeAfter) onClose?.();
		})();
	};

	const linkBusy = isLinkShareBusy;

	return (
		<div className="overflow-hidden rounded-2xl border border-foreground/8 bg-foreground/[0.03]">
			<div className={MOBILE_SECTION_LABEL}>Share link</div>
			<MobileActionButton
				icon={
					isLinkShareBusy ? (
						<Loader2 className="h-5 w-5 shrink-0 animate-spin text-foreground/72" />
					) : (
						<Copy className="h-5 w-5 shrink-0 text-foreground/72" />
					)
				}
				label={isLinkShareBusy ? "Publishing link…" : "Copy link"}
				disabled={isLinkShareBusy}
				onClick={() => runAction(() => copyShareLink())}
			/>
			<MobileActionDivider />
			<MobileActionButton
				icon={<XIcon className="h-5 w-5 shrink-0 text-foreground/72" />}
				label="Share on X"
				disabled={isLinkShareBusy}
				onClick={() => runAction(() => shareLinkOnX())}
			/>
			<MobileActionDivider />
			<MobileActionButton
				icon={<DiscordIcon className="h-5 w-5 shrink-0 text-foreground/72" />}
				label="Share on Discord"
				disabled={isLinkShareBusy}
				onClick={() => runAction(() => shareLinkOnDiscord(), false)}
			/>
			<MobileActionDivider />
			<MobileActionButton
				icon={<MessageCircle className="h-5 w-5 shrink-0 text-foreground/72" />}
				label="WhatsApp link"
				disabled={isLinkShareBusy}
				onClick={() => runAction(() => shareLinkWhatsApp())}
			/>

			<div className={cn(MOBILE_SECTION_LABEL, "border-t border-foreground/8")}>Send note</div>
			{canNativeShare ? (
				<>
					<MobileActionButton
						icon={<Share2 className="h-5 w-5 shrink-0 text-foreground/72" />}
						label="Share…"
						onClick={() => runAction(() => shareNative(), false)}
					/>
					<MobileActionDivider />
				</>
			) : null}
			{canSaveAsFile ? (
				<>
					<MobileActionButton
						icon={<FileDown className="h-5 w-5 shrink-0 text-foreground/72" />}
						label="Save as file"
						onClick={() => runAction(() => saveAsFile(), false)}
					/>
					<MobileActionDivider />
				</>
			) : null}
			{showAppleNotes ? (
				<>
					<MobileActionButton
						icon={<NotebookPen className="h-5 w-5 shrink-0 text-foreground/72" />}
						label="Apple Notes"
						onClick={() => runAction(() => shareAppleNotes(), false)}
					/>
					<MobileActionDivider />
				</>
			) : null}
			<MobileActionButton
				icon={<MessageCircle className="h-5 w-5 shrink-0 text-foreground/72" />}
				label="WhatsApp"
				onClick={() => runAction(() => shareWhatsApp())}
			/>
			<MobileActionDivider />
			<MobileActionButton
				icon={<Mail className="h-5 w-5 shrink-0 text-foreground/72" />}
				label="Email"
				onClick={() => runAction(() => shareEmail())}
			/>
			<MobileActionDivider />
			<MobileActionButton
				icon={<Download className="h-5 w-5 shrink-0 text-foreground/72" />}
				label="Download .md"
				onClick={() => runAction(() => downloadMarkdown())}
			/>
			{linkBusy ? (
				<p className="px-4 pb-3 pt-1 text-[12px] text-foreground/48">
					Preparing your share link…
				</p>
			) : null}
		</div>
	);
}

/** Inline send actions for the file-list mobile action sheet. */
export function NoteSendMobileActionBlock({
	note,
	onClose,
}: {
	note: NoteSendSource;
	onClose?: () => void;
}) {
	return <NoteSendMobilePanel note={note} onClose={onClose} prefetch />;
}

function LinkShareItems({
	onSelect,
	isBusy,
	copyShareLink,
	shareLinkOnX,
	shareLinkOnDiscord,
	shareLinkWhatsApp,
}: {
	onSelect?: () => void;
	isBusy: boolean;
	copyShareLink: () => Promise<void>;
	shareLinkOnX: () => Promise<void>;
	shareLinkOnDiscord: () => Promise<void>;
	shareLinkWhatsApp: () => Promise<void>;
}) {
	return (
		<>
			<ContextMenuItem
				className="gap-2"
				disabled={isBusy}
				onClick={() => {
					void copyShareLink();
					onSelect?.();
				}}
			>
				{isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
				{isBusy ? "Publishing link…" : "Copy link"}
			</ContextMenuItem>
			<ContextMenuItem
				className="gap-2"
				disabled={isBusy}
				onClick={() => {
					void shareLinkOnX();
					onSelect?.();
				}}
			>
				<XIcon className="h-4 w-4" />
				Share on X
			</ContextMenuItem>
			<ContextMenuItem
				className="gap-2"
				disabled={isBusy}
				onClick={() => {
					void shareLinkOnDiscord();
					onSelect?.();
				}}
			>
				<DiscordIcon className="h-4 w-4" />
				Share on Discord
			</ContextMenuItem>
			<ContextMenuItem
				className="gap-2"
				disabled={isBusy}
				onClick={() => {
					void shareLinkWhatsApp();
					onSelect?.();
				}}
			>
				<MessageCircle className="h-4 w-4" />
				WhatsApp link
			</ContextMenuItem>
		</>
	);
}

function NoteSendItems({
	note,
	onSelect,
}: {
	note: NoteSendSource;
	onSelect?: () => void;
}) {
	const {
		canNativeShare,
		canSaveAsFile,
		showAppleNotes,
		isLinkShareBusy,
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
	} = useNoteSend(note);

	return (
		<>
			<ContextMenuSub>
				<ContextMenuSubTrigger className="gap-2">
					<Link2 className="h-4 w-4" />
					Share link
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-48">
					<LinkShareItems
						onSelect={onSelect}
						isBusy={isLinkShareBusy}
						copyShareLink={copyShareLink}
						shareLinkOnX={shareLinkOnX}
						shareLinkOnDiscord={shareLinkOnDiscord}
						shareLinkWhatsApp={shareLinkWhatsApp}
					/>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuSeparator />
			{canNativeShare ? (
				<ContextMenuItem
					className="gap-2"
					onClick={() => {
						void shareNative();
						onSelect?.();
					}}
				>
					<Share2 className="h-4 w-4" />
					Share…
				</ContextMenuItem>
			) : null}
			{canSaveAsFile ? (
				<ContextMenuItem
					className="gap-2"
					onClick={() => {
						void saveAsFile();
						onSelect?.();
					}}
				>
					<FileDown className="h-4 w-4" />
					Save as file
				</ContextMenuItem>
			) : null}
			{showAppleNotes ? (
				<ContextMenuItem
					className="gap-2"
					onClick={() => {
						void shareAppleNotes();
						onSelect?.();
					}}
				>
					<NotebookPen className="h-4 w-4" />
					Apple Notes
				</ContextMenuItem>
			) : null}
			<ContextMenuItem
				className="gap-2"
				onClick={() => {
					shareWhatsApp();
					onSelect?.();
				}}
			>
				<MessageCircle className="h-4 w-4" />
				WhatsApp
			</ContextMenuItem>
			<ContextMenuItem
				className="gap-2"
				onClick={() => {
					shareEmail();
					onSelect?.();
				}}
			>
				<Mail className="h-4 w-4" />
				Email
			</ContextMenuItem>
			<ContextMenuItem
				className="gap-2"
				onClick={() => {
					downloadMarkdown();
					onSelect?.();
				}}
			>
				<Download className="h-4 w-4" />
				Download .md
			</ContextMenuItem>
		</>
	);
}

export function NoteSendContextSubmenu({ note }: { note: NoteSendSource }) {
	return (
		<ContextMenuSub>
			<ContextMenuSubTrigger className="gap-2">
				<Share2 className="h-4 w-4" />
				Send note
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className="w-48">
				<NoteSendItems note={note} />
			</ContextMenuSubContent>
		</ContextMenuSub>
	);
}

function NoteSendDesktopDropdown({
	note,
	triggerLabel,
}: {
	note: NoteSendSource;
	triggerLabel: string;
}) {
	const {
		canNativeShare,
		canSaveAsFile,
		showAppleNotes,
		isLinkShareBusy,
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
	} = useNoteSend(note);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
				>
					{triggerLabel}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem
					className="gap-2"
					disabled={isLinkShareBusy}
					onClick={() => void copyShareLink()}
				>
					{isLinkShareBusy ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Copy className="h-4 w-4" />
					)}
					{isLinkShareBusy ? "Publishing link…" : "Copy link"}
				</DropdownMenuItem>
				<DropdownMenuItem
					className="gap-2"
					disabled={isLinkShareBusy}
					onClick={() => void shareLinkOnX()}
				>
					<XIcon className="h-4 w-4" />
					Share on X
				</DropdownMenuItem>
				<DropdownMenuItem
					className="gap-2"
					disabled={isLinkShareBusy}
					onClick={() => void shareLinkOnDiscord()}
				>
					<DiscordIcon className="h-4 w-4" />
					Share on Discord
				</DropdownMenuItem>
				<DropdownMenuItem
					className="gap-2"
					disabled={isLinkShareBusy}
					onClick={() => void shareLinkWhatsApp()}
				>
					<MessageCircle className="h-4 w-4" />
					WhatsApp link
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{canNativeShare ? (
					<DropdownMenuItem className="gap-2" onClick={() => void shareNative()}>
						<Share2 className="h-4 w-4" />
						Share…
					</DropdownMenuItem>
				) : null}
				{canSaveAsFile ? (
					<DropdownMenuItem className="gap-2" onClick={() => void saveAsFile()}>
						<FileDown className="h-4 w-4" />
						Save as file
					</DropdownMenuItem>
				) : null}
				{showAppleNotes ? (
					<DropdownMenuItem className="gap-2" onClick={() => void shareAppleNotes()}>
						<NotebookPen className="h-4 w-4" />
						Apple Notes
					</DropdownMenuItem>
				) : null}
				<DropdownMenuItem className="gap-2" onClick={shareWhatsApp}>
					<MessageCircle className="h-4 w-4" />
					WhatsApp
				</DropdownMenuItem>
				<DropdownMenuItem className="gap-2" onClick={shareEmail}>
					<Mail className="h-4 w-4" />
					Email
				</DropdownMenuItem>
				<DropdownMenuItem className="gap-2" onClick={downloadMarkdown}>
					<Download className="h-4 w-4" />
					Download .md
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

const MOBILE_ROW_TRIGGER_CLASS =
	"pressable flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-foreground transition-colors active:bg-foreground/5";

export function NoteSendDropdown({
	note,
	triggerLabel = "Send note",
	isMobile = false,
	mobileTriggerVariant = "inline",
}: {
	note: NoteSendSource;
	triggerLabel?: string;
	isMobile?: boolean;
	mobileTriggerVariant?: "inline" | "row";
}) {
	const [sheetOpen, setSheetOpen] = useState(false);

	if (isMobile) {
		return (
			<>
				<button
					type="button"
					onClick={() => setSheetOpen(true)}
					className={
						mobileTriggerVariant === "row"
							? MOBILE_ROW_TRIGGER_CLASS
							: "pressable min-h-11 px-2 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
					}
				>
					{mobileTriggerVariant === "row" ? (
						<Share2 className="h-5 w-5 shrink-0 text-foreground/72" />
					) : null}
					<span className={mobileTriggerVariant === "row" ? "truncate" : undefined}>
						{triggerLabel}
					</span>
				</button>
				<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
					<SheetContent
						side="bottom"
						className="rounded-t-[1.35rem] border-foreground/10 bg-background px-0 pb-0 pt-2"
					>
						<div className="px-5 pb-3">
							<div className="mx-auto h-1.5 w-12 rounded-full bg-foreground/12" />
							<SheetTitle className="mt-4 text-center text-[15px] font-medium text-foreground">
								Send note
							</SheetTitle>
							<SheetDescription className="mt-1 text-center text-[12px] text-foreground/48">
								Share a link or send the note content
							</SheetDescription>
						</div>
						<div className="space-y-3 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
							{sheetOpen ? (
								<NoteSendMobilePanel
									note={note}
									onClose={() => setSheetOpen(false)}
									prefetch
								/>
							) : null}
						</div>
					</SheetContent>
				</Sheet>
			</>
		);
	}

	return <NoteSendDesktopDropdown note={note} triggerLabel={triggerLabel} />;
}
