"use client";

import { FileText, FolderOpen } from "lucide-react";
import { FileTextIcon } from "@/shared/icons/file-text";
import { FolderOpenIcon } from "@/shared/icons/folder-open";
import { usePreferencesStore } from "@/features/settings/store";

type Props = {
	kind: "file" | "folder";
	size?: number;
	className?: string;
};

export function SidebarItemIcon({ kind, size = 14, className }: Props) {
	const showAnimatedIcons = usePreferencesStore((state) => state.appearance.showAnimatedIcons);

	if (kind === "file") {
		return showAnimatedIcons ? (
			<FileTextIcon size={size} className={className} />
		) : (
			<FileText size={size} className={className} strokeWidth={1.6} />
		);
	}

	return showAnimatedIcons ? (
		<FolderOpenIcon size={size} className={className} />
	) : (
		<FolderOpen size={size} className={className} strokeWidth={1.6} />
	);
}
