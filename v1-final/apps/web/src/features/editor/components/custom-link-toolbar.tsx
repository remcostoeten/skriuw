import { useState } from "react";
import { FileText } from "lucide-react";
import { LinkToolbarExtension } from "@blocknote/core/extensions";
import {
	DeleteLinkButton,
	EditLinkButton,
	OpenLinkButton,
	type LinkToolbarProps,
	useComponentsContext,
	useExtension,
} from "@blocknote/react";
import { getNoteTitle } from "@/domain/notes/note-links";
import { useNotesStore } from "@/features/notes/store";
import type { NoteFile } from "@/types/notes";
import { NoteLinkMenuList } from "./note-link-menu-list";

function LinkKindBadge({ url }: { url: string }) {
	const isInternal = url.startsWith("note://");
	return (
		<span className="mx-1 inline-flex h-7 items-center rounded-[4px] border border-border/80 px-2 text-[11px] font-medium text-muted-foreground">
			{isInternal ? "Internal" : "External"}
		</span>
	);
}

function ConvertLinkToNoteButton({
	files,
	activeFileId,
	text,
	range,
	setToolbarOpen,
}: Pick<LinkToolbarProps, "text" | "range" | "setToolbarOpen"> & {
	files: NoteFile[];
	activeFileId?: string;
}) {
	const Components = useComponentsContext()!;
	const { editLink } = useExtension(LinkToolbarExtension);
	const [open, setOpen] = useState(false);

	return (
		<Components.Generic.Popover.Root open={open} onOpenChange={setOpen}>
			<Components.Generic.Popover.Trigger>
				<Components.LinkToolbar.Button
					className="bn-button"
					label="Link note"
					mainTooltip="Point this link at another note"
					icon={<FileText />}
					isSelected={false}
				/>
			</Components.Generic.Popover.Trigger>
			<Components.Generic.Popover.Content
				className="bn-popover-content"
				variant="form-popover"
			>
				<NoteLinkMenuList
					files={files}
					activeFileId={activeFileId}
					onSelect={(targetFile) => {
						editLink(
							`note://${targetFile.id}`,
							text.trim() || getNoteTitle(targetFile),
							range.from,
						);
						setOpen(false);
						setToolbarOpen?.(false);
					}}
				/>
			</Components.Generic.Popover.Content>
		</Components.Generic.Popover.Root>
	);
}

export function CustomLinkToolbar(
	props: LinkToolbarProps & {
		files: NoteFile[];
		activeFileId?: string;
	},
) {
	const Components = useComponentsContext()!;
	const setActiveFileId = useNotesStore((state) => state.setActiveFileId);
	const internalNoteId = props.url.startsWith("note://")
		? props.url.replace(/^note:\/\//, "")
		: null;

	return (
		<Components.LinkToolbar.Root className="bn-toolbar bn-link-toolbar">
			<LinkKindBadge url={props.url} />
			<EditLinkButton
				url={props.url}
				text={props.text}
				range={props.range}
				setToolbarOpen={props.setToolbarOpen}
				setToolbarPositionFrozen={props.setToolbarPositionFrozen}
			/>
			<ConvertLinkToNoteButton
				files={props.files}
				activeFileId={props.activeFileId}
				text={props.text}
				range={props.range}
				setToolbarOpen={props.setToolbarOpen}
			/>
			{internalNoteId ? (
				<Components.LinkToolbar.Button
					className="bn-button"
					label="Open note"
					mainTooltip="Open linked note"
					icon={<FileText />}
					isSelected={false}
					onClick={() => {
						setActiveFileId(internalNoteId);
						const url = new URL(window.location.href);
						url.searchParams.set("note", internalNoteId);
						window.history.pushState({}, "", url.toString());
						props.setToolbarOpen?.(false);
					}}
				/>
			) : (
				<OpenLinkButton url={props.url} />
			)}
			<DeleteLinkButton range={props.range} setToolbarOpen={props.setToolbarOpen} />
		</Components.LinkToolbar.Root>
	);
}
