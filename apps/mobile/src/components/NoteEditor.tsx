// Plain-markdown note editor form. The MVP deliberately ships raw-markdown
// editing rather than a rich block editor (BlockNote is DOM/ProseMirror-only
// and can't run in RN — see docs/mobile-expo-architecture.md §7). The server
// re-derives richContent from the markdown on save, so the native read
// renderer still gets a rich document on the next fetch.
import { Platform, ScrollView, TextInput } from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { fonts } from "@/theme/fonts";
import { useMobilePreferences } from "@/preferences/preferences-provider";

const fontSizes = { small: 14, medium: 16, large: 18 } as const;
const lineHeightMultipliers = { compact: 1.35, comfortable: 1.5, relaxed: 1.75 } as const;

type Props = {
	title: string;
	body: string;
	onChangeTitle: (value: string) => void;
	onChangeBody: (value: string) => void;
	autoFocus?: boolean;
};

export function NoteEditor({ title, body, onChangeTitle, onChangeBody, autoFocus }: Props) {
	const { theme } = useTheme();
	const { editorFontSize, editorLineHeight, spellCheck } = useMobilePreferences();
	const fontSize = fontSizes[editorFontSize];
	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: theme.background }}
			contentContainerStyle={{
				paddingHorizontal: 16,
				paddingTop: 12,
				paddingBottom: 24,
				flexGrow: 1,
			}}
			keyboardShouldPersistTaps="handled"
			keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
			automaticallyAdjustKeyboardInsets
		>
			<TextInput
				value={title}
				onChangeText={onChangeTitle}
				placeholder="Title"
				placeholderTextColor={theme.textDim}
				autoFocus={autoFocus}
				style={{
					color: theme.foreground,
					fontSize: 21,
					fontWeight: "700",
					paddingVertical: 8,
					marginBottom: 8,
					borderBottomWidth: 1,
					borderBottomColor: theme.border,
				}}
			/>
			<TextInput
				value={body}
				onChangeText={onChangeBody}
				placeholder="Write in markdown…"
				placeholderTextColor={theme.textDim}
				multiline
				spellCheck={spellCheck}
				autoCorrect={spellCheck}
				textAlignVertical="top"
				style={{
					flex: 1,
					color: theme.foreground,
					fontSize,
					lineHeight: Math.round(fontSize * lineHeightMultipliers[editorLineHeight]),
					fontFamily: fonts.mono,
					minHeight: 240,
					paddingTop: 4,
				}}
			/>
		</ScrollView>
	);
}
