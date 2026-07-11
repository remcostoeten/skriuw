"use client";

import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { NoteCoverPicker } from "@/features/notes/components/note-cover";
import { NoteIconPicker } from "@/features/notes/components/note-icon-picker";
import { cn } from "@/shared/lib/utils";

export type NoteAssetsProps = {
	icon?: string;
	cover?: string;
	readOnly?: boolean;
	isMobile?: boolean;
	onIconChange?: (icon: string) => void;
	onCoverChange?: (cover: string) => void;
};

export function hasNoteAssetsSurface({
	icon,
	cover,
	readOnly,
	onIconChange,
	onCoverChange,
}: NoteAssetsProps) {
	if (!readOnly && (onIconChange || onCoverChange)) return true;
	return Boolean(icon || cover);
}

export function NoteAssetsRows({
	icon,
	cover,
	readOnly,
	isMobile = false,
	onIconChange,
	onCoverChange,
}: NoteAssetsProps) {
	const canEditIcon = !readOnly && Boolean(onIconChange);
	const canEditCover = !readOnly && Boolean(onCoverChange);

	return (
		<div className="flex flex-col gap-0.5">
			{canEditIcon || icon ? (
				<AssetRow
					label="Icon"
					isMobile={isMobile}
					onRemove={canEditIcon && icon ? () => onIconChange?.("") : undefined}
				>
					{canEditIcon && onIconChange ? (
						<NoteIconPicker icon={icon} onIconChange={onIconChange} />
					) : (
						<span className="px-1 text-base">{icon}</span>
					)}
				</AssetRow>
			) : null}

			{canEditCover || cover ? (
				<AssetRow
					label="Cover"
					isMobile={isMobile}
					onRemove={canEditCover && cover ? () => onCoverChange?.("") : undefined}
				>
					{canEditCover && onCoverChange ? (
						<NoteCoverPicker cover={cover} onCoverChange={onCoverChange} />
					) : (
						<span className="px-1 text-[13px] text-muted-foreground">Cover set</span>
					)}
				</AssetRow>
			) : null}
		</div>
	);
}

export function NoteAssetsChips({
	icon,
	cover,
	readOnly,
	onIconChange,
	onCoverChange,
}: NoteAssetsProps) {
	const canEditIcon = !readOnly && onIconChange;
	const canEditCover = !readOnly && onCoverChange;

	return (
		<>
			{canEditIcon ? (
				<NoteIconPicker icon={icon} onIconChange={onIconChange} />
			) : icon ? (
				<span className="text-base">{icon}</span>
			) : null}
			{canEditCover ? <NoteCoverPicker cover={cover} onCoverChange={onCoverChange} /> : null}
		</>
	);
}

function AssetRow({
	label,
	isMobile,
	onRemove,
	children,
}: {
	label: string;
	isMobile: boolean;
	onRemove?: () => void;
	children: ReactNode;
}) {
	return (
		<div className="group flex items-center gap-2">
			<span className="flex h-7 w-36 shrink-0 items-center px-1 text-[13px] text-muted-foreground">
				{label}
			</span>
			<div className={cn("flex min-h-7 min-w-0 flex-1 items-center", isMobile && "min-h-11")}>
				{children}
			</div>
			{onRemove ? (
				<button
					type="button"
					onClick={onRemove}
					aria-label={`Remove note ${label.toLowerCase()}`}
					className={cn(
						"rounded-md p-1.5 text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100",
						isMobile && "min-h-11 min-w-11",
					)}
				>
					<Trash2 className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}
