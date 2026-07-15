"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { NOTE_PROPERTY_COLORS } from "@/domain/notes/properties";
import { cn } from "@/shared/lib/utils";
import {
	formatInlinePersonLabel,
	normalizeInlinePersonName,
} from "@/features/editor/lib/inline-person";
import { usePeopleContext } from "./people-context";

interface Props {
	id: string;
	cachedName: string;
}

export function PersonChip({ id, cachedName }: Props) {
	const { byId, byName } = usePeopleContext();
	const router = useRouter();

	// The Person row is the source of truth: renaming it updates every
	// Mention. Id-less chips (bare `$name` text upgraded on load) resolve by
	// name; the cached name is the last fallback (deleted person, or a
	// guest/offline read with no people list).
	const resolved = id ? byId.get(id) : byName.get(cachedName.trim().toLowerCase());
	const name = normalizeInlinePersonName(resolved?.name ?? cachedName);
	const label = formatInlinePersonLabel(name);
	const dot = resolved?.color ? NOTE_PROPERTY_COLORS[resolved.color].dot : undefined;

	function handleClick(event: MouseEvent<HTMLButtonElement>) {
		event.preventDefault();
		event.stopPropagation();
		const targetId = id || resolved?.id;
		if (!targetId) {
			return;
		}
		router.push(`/app/people/${targetId}`);
	}

	return (
		<button
			type="button"
			onMouseDown={(event) => event.preventDefault()}
			onClick={handleClick}
			contentEditable={false}
			data-note-person
			aria-label={name ? `Open person ${name}` : "Person"}
			className={cn(
				"mx-[1px] inline-flex max-w-[18ch] cursor-pointer items-center gap-1 overflow-hidden rounded-[4px] border px-1.5 py-0 text-[0.82em] font-medium leading-[1.45] align-baseline transition-colors",
				"border-border/80 bg-muted/60 text-foreground/82 hover:border-ring/70 hover:bg-muted hover:text-foreground",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
			)}
		>
			<span
				aria-hidden="true"
				className="size-[0.6em] shrink-0 rounded-full"
				style={{ backgroundColor: dot ?? "currentColor" }}
			/>
			<span className="min-w-0 truncate">{label}</span>
		</button>
	);
}
