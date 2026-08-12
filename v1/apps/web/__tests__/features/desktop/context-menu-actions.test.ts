import { describe, expect, test } from "bun:test";
import {
	getCalendarDayContextMenuState,
	getEditorContextMenuState,
} from "@/features/desktop/context-menu-actions";

describe("desktop context menu action helpers", () => {
	test("marks editor mode actions from the current mode", () => {
		expect(getEditorContextMenuState({ mode: "block", hasFile: true })).toEqual({
			canCopyTitle: true,
			canExportMarkdown: true,
			modeLabel: "Switch to raw markdown",
		});

		expect(getEditorContextMenuState({ mode: "raw", hasFile: false })).toEqual({
			canCopyTitle: false,
			canExportMarkdown: false,
			modeLabel: "Switch to block editor",
		});
	});

	test("describes calendar day actions by entry state", () => {
		expect(
			getCalendarDayContextMenuState({
				hasEntry: true,
				isSelected: false,
				isToday: false,
			}),
		).toEqual({
			openLabel: "Open entry",
			copyLabel: "Copy date",
			canJumpToToday: true,
		});

		expect(
			getCalendarDayContextMenuState({
				hasEntry: false,
				isSelected: true,
				isToday: true,
			}),
		).toEqual({
			openLabel: "Start entry",
			copyLabel: "Copy date",
			canJumpToToday: false,
		});
	});
});
