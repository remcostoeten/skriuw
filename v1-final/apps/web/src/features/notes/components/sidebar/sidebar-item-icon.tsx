"use client";

import { FileText, FolderOpen } from "lucide-react";
import { FileTextIcon } from "@/shared/icons/file-text";
import { FolderOpenIcon as AnimatedFolderOpenIcon } from "@animateicons/react/lucide";
import { usePreferencesStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/utils";

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
		<AnimatedFolderOpenIcon size={size} className={cn("skriuw-animated-icon", className)} />
	) : (
		<FolderOpen size={size} className={className} strokeWidth={1.6} />
	);
}
