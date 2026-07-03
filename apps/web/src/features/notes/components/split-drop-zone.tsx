"use client";

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import {
	getActiveTreeItemDrag,
	isTreeItemDrag,
	readDroppedFileId,
} from "../lib/note-drag";

const EDGE_THRESHOLD = 0.3;

type SnapZone = "left" | "right" | "top" | "bottom" | "center";

type Props = {
	disabled?: boolean;
	activeFileId: string | null;
	onOpenInSplit: (
		id: string,
		orientation: "vertical" | "horizontal",
		placement?: "before" | "after",
	) => void;
	onFileSelect: (id: string) => void;
	children: ReactNode;
};

function isTabBarTarget(event: DragEvent): boolean {
	return (
		event.target instanceof Element &&
		Boolean(event.target.closest('[role="tablist"]'))
	);
}

function zoneOverlayClass(zone: SnapZone): string {
	switch (zone) {
		case "left":
			return "inset-y-0 left-0 w-1/2";
		case "right":
			return "inset-y-0 right-0 w-1/2";
		case "top":
			return "inset-x-0 top-0 h-1/2";
		case "bottom":
			return "inset-x-0 bottom-0 h-1/2";
		case "center":
			return "inset-0";
	}
}

export function SplitDropZone({
	disabled = false,
	activeFileId,
	onOpenInSplit,
	onFileSelect,
	children,
}: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [zone, setZone] = useState<SnapZone | null>(null);
	const zoneRef = useRef<SnapZone | null>(null);
	const commitRef = useRef<(dropZone: SnapZone, fileId: string) => void>(() => {});

	function updateZone(next: SnapZone | null) {
		zoneRef.current = next;
		setZone(next);
	}

	function computeZone(event: DragEvent): SnapZone {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect || rect.width === 0 || rect.height === 0) return "center";
		const fx = (event.clientX - rect.left) / rect.width;
		const fy = (event.clientY - rect.top) / rect.height;
		const distances: Array<[SnapZone, number]> = [
			["left", fx],
			["right", 1 - fx],
			["top", fy],
			["bottom", 1 - fy],
		];
		const [nearest, distance] = distances.reduce((min, entry) =>
			entry[1] < min[1] ? entry : min,
		);
		return distance > EDGE_THRESHOLD ? "center" : nearest;
	}

	function commit(dropZone: SnapZone, fileId: string) {
		switch (dropZone) {
			case "left":
				onOpenInSplit(fileId, "vertical", "before");
				return;
			case "right":
				onOpenInSplit(fileId, "vertical", "after");
				return;
			case "top":
				onOpenInSplit(fileId, "horizontal", "before");
				return;
			case "bottom":
				onOpenInSplit(fileId, "horizontal", "after");
				return;
			case "center":
				if (fileId !== activeFileId) onFileSelect(fileId);
				return;
		}
	}
	commitRef.current = commit;

	// WebKitGTK doesn't always fire the drop event, so releasing the drag would
	// leave the indicator shown and open nothing. On dragend, snap to the last
	// highlighted zone and open the note there. The drop handler clears zoneRef
	// first, so this only commits when drop never ran.
	useEffect(() => {
		function handleWindowDragEnd() {
			const item = getActiveTreeItemDrag();
			const pendingZone = zoneRef.current;
			zoneRef.current = null;
			setZone(null);
			if (!pendingZone || !item || item.type !== "file") return;
			commitRef.current(pendingZone, item.id);
		}
		window.addEventListener("dragend", handleWindowDragEnd, true);
		return () => window.removeEventListener("dragend", handleWindowDragEnd, true);
	}, []);

	// Capture phase + stopPropagation keeps the drag away from ProseMirror,
	// which would otherwise paste the drag's text payload into the note on
	// drop. Tab-bar targets are left alone so the TabBar can accept the note.
	const handleDragOverCapture = (event: DragEvent<HTMLDivElement>) => {
		if (disabled || !isTreeItemDrag(event)) return;
		if (isTabBarTarget(event)) {
			updateZone(null);
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = "copy";
		updateZone(computeZone(event));
	};

	const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) {
			updateZone(null);
			return;
		}
		const { clientX, clientY } = event;
		if (
			clientX < rect.left ||
			clientX > rect.right ||
			clientY < rect.top ||
			clientY > rect.bottom
		) {
			updateZone(null);
		}
	};

	const handleDropCapture = (event: DragEvent<HTMLDivElement>) => {
		if (disabled || !isTreeItemDrag(event)) return;
		if (isTabBarTarget(event)) {
			updateZone(null);
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const dropZone = computeZone(event);
		updateZone(null);
		const active = getActiveTreeItemDrag();
		const fileId =
			readDroppedFileId(event) ?? (active?.type === "file" ? active.id : null);
		if (!fileId) return;
		commit(dropZone, fileId);
	};

	return (
		<div
			ref={containerRef}
			className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
			onDragOverCapture={handleDragOverCapture}
			onDragLeave={handleDragLeave}
			onDropCapture={handleDropCapture}
		>
			{children}
			{zone && (
				<div className="pointer-events-none absolute inset-0 z-30">
					<div
						className={cn(
							"absolute border-2 border-primary bg-primary/12 transition-all duration-100",
							zoneOverlayClass(zone),
						)}
					/>
				</div>
			)}
		</div>
	);
}
