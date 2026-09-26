import { useState } from "react";
import { cn } from "@/shared/lib/utils";

type ResizeDirection =
	| "North"
	| "South"
	| "East"
	| "West"
	| "NorthEast"
	| "NorthWest"
	| "SouthEast"
	| "SouthWest";

type TauriWindow = {
	startResizeDragging: (direction: ResizeDirection) => Promise<void>;
};

type TauriWindowApi = { getCurrentWindow: () => TauriWindow };

type TauriGlobal = { __TAURI__?: { window?: TauriWindowApi } };

function getTauriWindow(): TauriWindow | null {
	const api = (window as unknown as TauriGlobal).__TAURI__?.window;
	return api ? api.getCurrentWindow() : null;
}

type HandleSpec = {
	direction: ResizeDirection;
	className: string;
};

const HANDLES: HandleSpec[] = [
	{ direction: "North", className: "inset-x-3 top-0 h-1 cursor-ns-resize" },
	{ direction: "South", className: "inset-x-3 bottom-0 h-1 cursor-ns-resize" },
	{ direction: "West", className: "inset-y-3 left-0 w-1 cursor-ew-resize" },
	{ direction: "East", className: "inset-y-3 right-0 w-1 cursor-ew-resize" },
	{ direction: "NorthWest", className: "left-0 top-0 h-3 w-3 cursor-nwse-resize" },
	{ direction: "NorthEast", className: "right-0 top-0 h-3 w-3 cursor-nesw-resize" },
	{ direction: "SouthWest", className: "bottom-0 left-0 h-3 w-3 cursor-nesw-resize" },
	{ direction: "SouthEast", className: "bottom-0 right-0 h-3 w-3 cursor-nwse-resize" },
];

export function WindowResizeHandles() {
	const [tauriWindow] = useState<TauriWindow | null>(getTauriWindow);
	if (!tauriWindow) return null;

	return (
		<div className="pointer-events-none fixed inset-0 z-[9999]">
			{HANDLES.map((handle) => (
				<div
					key={handle.direction}
					onMouseDown={(event) => {
						if (event.button !== 0) return;
						event.preventDefault();
						tauriWindow.startResizeDragging(handle.direction);
					}}
					className={cn("pointer-events-auto absolute", handle.className)}
				/>
			))}
		</div>
	);
}
