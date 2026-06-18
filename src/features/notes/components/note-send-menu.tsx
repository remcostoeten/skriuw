"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
	Copy,
	Download,
	FileDown,
	Link2,
	Loader2,
	Lock,
	Mail,
	MessageCircle,
	MessageSquare,
	NotebookPen,
	Share2,
} from "lucide-react";
import { useIsGuestWorkspace } from "@/core/workspace-backend";
import { useRouter } from "next/navigation";
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
import {
	LINK_SHARE_ACTIONS,
	LinkShareBrandIcon,
	linkShareActionLabel,
	runLinkShareAction,
	type LinkShareHandlers,
} from "@/features/notes/lib/note-send-actions";
import { StaleShareHint } from "@/features/notes/components/stale-share-hint";
import { cn } from "@/shared/lib/utils";
import type { NoteFile } from "@/types/notes";

type NoteSendSource = Pick<NoteFile, "id" | "name" | "content">;

const MOBILE_ACTION_CLASS =
	"flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-foreground transition-colors active:bg-foreground/5 disabled:opacity-40";
const MOBILE_SECTION_LABEL =
	"px-4 pb-2 pt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42";

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
	const isGuest = useIsGuestWorkspace();

	useEffect(() => {
		if (!prefetch || !note?.id || isGuest) return;
		void send.prefetchShareLink();
	}, [prefetch, note?.id, send.prefetchShareLink, isGuest]);

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
		shareLinkTelegram,
		shareLinkSms,
		shareLinkEmail,
		shareSms,
		copyMarkdown,
		shareIsStale,
		isRefreshingShare,
		refreshShareSnapshot,
	} = useNoteSendMenu(note, prefetch);

	const linkHandlers: LinkShareHandlers = {
		copyShareLink,
		shareLinkOnX,
		shareLinkOnDiscord,
		shareLinkWhatsApp,
		shareLinkTelegram,
		shareLinkSms,
		shareLinkEmail,
	};

	const runAction = (action: () => void | Promise<void>, closeAfter = true) => {
		void (async () => {
			await action();
			if (closeAfter) onClose?.();
		})();
	};

	const linkBusy = isLinkShareBusy;

	return (
		<div className="overflow-hidden rounded-2xl border border-foreground/8 bg-foreground/[0.03] pb-[env(safe-area-inset-bottom)]">
			{shareIsStale ? (
				<StaleShareHint
					layout="banner"
					isRefreshing={isRefreshingShare}
					onRefresh={() => void refreshShareSnapshot()}
				/>
			) : null}
			<div className={MOBILE_SECTION_LABEL}>Share link</div>
			{LINK_SHARE_ACTIONS.map((action, index) => (
				<div key={action.id}>
					{index > 0 ? <MobileActionDivider /> : null}
					<MobileActionButton
						icon={
							action.id === "copy" && isLinkShareBusy ? (
								<Loader2 className="h-5 w-5 shrink-0 animate-spin text-foreground/72" />
							) : (
								<LinkShareBrandIcon
									icon={action.icon}
									className="h-5 w-5 shrink-0 text-foreground/72"
								/>
							)
						}
						label={linkShareActionLabel(action, isLinkShareBusy)}
						disabled={isLinkShareBusy}
						onClick={() =>
							runAction(
								() => runLinkShareAction(action.id, linkHandlers),
								action.closeAfter !== false,
							)
						}
					/>
				</div>
			))}

			<div className={cn(MOBILE_SECTION_LABEL, "border-t border-foreground/8")}>
				Send note
			</div>
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
				icon={<MessageSquare className="h-5 w-5 shrink-0 text-foreground/72" />}
				label="SMS"
				onClick={() => runAction(() => shareSms())}
			/>
			<MobileActionDivider />
			<MobileActionButton
				icon={<Copy className="h-5 w-5 shrink-0 text-foreground/72" />}
				label="Copy markdown"
				onClick={() => runAction(() => copyMarkdown())}
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
	handlers,
}: {
	onSelect?: () => void;
	isBusy: boolean;
	handlers: LinkShareHandlers;
}) {
	return (
		<>
			{LINK_SHARE_ACTIONS.map((action) => (
				<ContextMenuItem
					key={action.id}
					className="gap-2"
					disabled={isBusy}
					onClick={() => {
						void runLinkShareAction(action.id, handlers);
						onSelect?.();
					}}
				>
					{action.id === "copy" && isBusy ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<LinkShareBrandIcon icon={action.icon} className="h-4 w-4" />
					)}
					{linkShareActionLabel(action, isBusy)}
				</ContextMenuItem>
			))}
		</>
	);
}

function NoteSendItems({ note, onSelect }: { note: NoteSendSource; onSelect?: () => void }) {
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
		shareLinkTelegram,
		shareLinkSms,
		shareLinkEmail,
		shareSms,
		copyMarkdown,
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
						handlers={{
							copyShareLink,
							shareLinkOnX,
							shareLinkOnDiscord,
							shareLinkWhatsApp,
							shareLinkTelegram,
							shareLinkSms,
							shareLinkEmail,
						}}
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
					shareSms();
					onSelect?.();
				}}
			>
				<MessageSquare className="h-4 w-4" />
				SMS
			</ContextMenuItem>
			<ContextMenuItem
				className="gap-2"
				onClick={() => {
					void copyMarkdown();
					onSelect?.();
				}}
			>
				<Copy className="h-4 w-4" />
				Copy markdown
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
	const isGuest = useIsGuestWorkspace();
	const router = useRouter();

	if (isGuest) {
		return (
			<ContextMenuItem
				className="gap-2 text-muted-foreground"
				onSelect={(event) => {
					event.preventDefault();
					router.push("/app?auth=sign-up");
				}}
			>
				<Lock className="h-4 w-4" />
				Send note — sign up to unlock
			</ContextMenuItem>
		);
	}

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
		shareLinkTelegram,
		shareLinkSms,
		shareLinkEmail,
		shareSms,
		copyMarkdown,
	} = useNoteSend(note);

	const linkHandlers: LinkShareHandlers = {
		copyShareLink,
		shareLinkOnX,
		shareLinkOnDiscord,
		shareLinkWhatsApp,
		shareLinkTelegram,
		shareLinkSms,
		shareLinkEmail,
	};

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
				{LINK_SHARE_ACTIONS.map((action) => (
					<DropdownMenuItem
						key={action.id}
						className="gap-2"
						disabled={isLinkShareBusy}
						onClick={() => void runLinkShareAction(action.id, linkHandlers)}
					>
						{action.id === "copy" && isLinkShareBusy ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<LinkShareBrandIcon icon={action.icon} className="h-4 w-4" />
						)}
						{linkShareActionLabel(action, isLinkShareBusy)}
					</DropdownMenuItem>
				))}
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
				<DropdownMenuItem className="gap-2" onClick={shareSms}>
					<MessageSquare className="h-4 w-4" />
					SMS
				</DropdownMenuItem>
				<DropdownMenuItem className="gap-2" onClick={() => void copyMarkdown()}>
					<Copy className="h-4 w-4" />
					Copy markdown
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
