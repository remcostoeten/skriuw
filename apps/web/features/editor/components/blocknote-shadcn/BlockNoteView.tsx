import { shadcnComponents } from "./components";
import { type BlockSchema, type InlineContentSchema, type StyleSchema, mergeCSSClasses } from "@blocknote/core";
import { type BlockNoteViewProps, BlockNoteViewRaw, ComponentsContext, useBlockNoteContext, usePrefersColorScheme } from "@blocknote/react";

type ThemeChoice = 'light' | 'dark'

export const BlockNoteView = <
	BSchema extends BlockSchema,
	ISchema extends InlineContentSchema,
	SSchema extends StyleSchema
>(
	props: BlockNoteViewProps<BSchema, ISchema, SSchema> & {
		theme?: ThemeChoice
		className?: string
	}
) => {
	const { className, theme, ...rest } = props
	const existingContext = useBlockNoteContext()
	const prefers = usePrefersColorScheme()
	const defaultScheme = existingContext?.colorSchemePreference || prefers

	const resolvedTheme: ThemeChoice = theme ?? (defaultScheme === 'dark' ? 'dark' : 'light')

	return (
		<ComponentsContext.Provider value={shadcnComponents}>
			<BlockNoteViewRaw
				{...rest}
				className={mergeCSSClasses('bn-shadcn', className || '')}
				theme={resolvedTheme}
			/>
		</ComponentsContext.Provider>
	)
}
