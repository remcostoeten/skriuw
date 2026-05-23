"use client";

import type { BlockSchema, InlineContentSchema, StyleSchema } from "@blocknote/core";
import { mergeCSSClasses } from "@blocknote/core";
import {
	applyBlockNoteCSSVariablesFromTheme,
	removeBlockNoteCSSVariables,
	type Theme,
} from "@blocknote/mantine";
import {
	BlockNoteViewRaw,
	ComponentsContext,
	useBlockNoteContext,
	usePrefersColorScheme,
} from "@blocknote/react";
import { useCallback, type ComponentProps } from "react";
import { portalBlockNoteComponents } from "./blocknote-portal-components";

type SkriuwBlockNoteViewProps<
	BSchema extends BlockSchema,
	ISchema extends InlineContentSchema,
	SSchema extends StyleSchema,
> = Omit<ComponentProps<typeof BlockNoteViewRaw<BSchema, ISchema, SSchema>>, "theme"> & {
	theme?: "light" | "dark" | Theme | { light: Theme; dark: Theme };
};

export function SkriuwBlockNoteView<
	BSchema extends BlockSchema,
	ISchema extends InlineContentSchema,
	SSchema extends StyleSchema,
>({
	className,
	theme,
	...props
}: SkriuwBlockNoteViewProps<BSchema, ISchema, SSchema>) {
	const existingContext = useBlockNoteContext();
	const systemColorScheme = usePrefersColorScheme();
	const defaultColorScheme =
		existingContext?.colorSchemePreference || systemColorScheme;

	const applyThemeToNode = useCallback(
		(node: HTMLDivElement | null) => {
			if (!node) {
				return;
			}

			removeBlockNoteCSSVariables(node);

			if (typeof theme !== "object" || theme === null) {
				return;
			}

			if ("light" in theme && "dark" in theme) {
				applyBlockNoteCSSVariablesFromTheme(
					theme[defaultColorScheme === "dark" ? "dark" : "light"],
					node,
				);
				return;
			}

			applyBlockNoteCSSVariablesFromTheme(theme, node);
		},
		[defaultColorScheme, theme],
	);

	const finalTheme =
		typeof theme === "string"
			? theme
			: defaultColorScheme !== "no-preference"
				? defaultColorScheme
				: "light";

	return (
		<ComponentsContext.Provider value={portalBlockNoteComponents}>
			<BlockNoteViewRaw
				data-mantine-color-scheme={finalTheme}
				className={mergeCSSClasses("bn-mantine", className || "")}
				theme={typeof theme === "object" ? undefined : theme}
				{...props}
				ref={applyThemeToNode}
			/>
		</ComponentsContext.Provider>
	);
}
