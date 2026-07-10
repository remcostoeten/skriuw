// Plain-markdown note editor form. The MVP deliberately ships raw-markdown
// editing rather than a rich block editor (BlockNote is DOM/ProseMirror-only
// and can't run in RN — see docs/mobile-expo-architecture.md §7). The server
// re-derives richContent from the markdown on save, so the native read
// renderer still gets a rich document on the next fetch.
import { KeyboardAvoidingView, Platform, ScrollView, TextInput } from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { fonts } from "@/theme/fonts";

type Props = {
	title: string;
	body: string;
	onChangeTitle: (value: string) => void;
	onChangeBody: (value: string) => void;
	autoFocus?: boolean;
};

export function NoteEditor({ title, body, onChangeTitle, onChangeBody, autoFocus }: Props) {
	const { theme } = useTheme();
	return (
		<KeyboardAvoidingView
			style={{ flex: 1, backgroundColor: theme.background }}
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{ padding: 16, flexGrow: 1 }}
				keyboardShouldPersistTaps="handled"
			>
				<TextInput
					value={title}
					onChangeText={onChangeTitle}
					placeholder="Title"
					placeholderTextColor={theme.textDim}
					autoFocus={autoFocus}
					style={{
						color: theme.foreground,
						fontSize: 22,
						fontWeight: "700",
						paddingBottom: 12,
						marginBottom: 12,
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
					textAlignVertical="top"
					style={{
						flex: 1,
						color: theme.foreground,
						fontSize: 16,
						lineHeight: 24,
						fontFamily: fonts.mono,
						minHeight: 240,
					}}
				/>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}
