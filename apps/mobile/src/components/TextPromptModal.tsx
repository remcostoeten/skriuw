// A themed replacement for Alert.prompt (which is iOS-only). Used for creating
// folders and renaming notes/folders. Keyboard-safe and cross-platform.
import { useEffect, useState } from "react";
import {
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	Text,
	TextInput,
	View,
} from "react-native";
import { useTheme } from "@/theme/theme-provider";

type Props = {
	visible: boolean;
	title: string;
	placeholder?: string;
	initialValue?: string;
	confirmLabel?: string;
	onCancel: () => void;
	onConfirm: (value: string) => void;
};

export function TextPromptModal({
	visible,
	title,
	placeholder,
	initialValue = "",
	confirmLabel = "Save",
	onCancel,
	onConfirm,
}: Props) {
	const { theme } = useTheme();
	const [value, setValue] = useState(initialValue);

	// Re-seed each time the modal (re)opens for a fresh target.
	useEffect(() => {
		if (visible) setValue(initialValue);
	}, [visible, initialValue]);

	const trimmed = value.trim();

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				style={{
					flex: 1,
					justifyContent: "center",
					padding: 18,
					backgroundColor: "rgba(0,0,0,0.5)",
				}}
			>
				<View
					style={{
						backgroundColor: theme.popover,
						borderWidth: 1,
						borderColor: theme.border,
						borderRadius: theme.radius + 6,
						padding: 16,
					}}
				>
					<Text
						style={{
							color: theme.foreground,
							fontSize: 16,
							fontWeight: "700",
							marginBottom: 14,
						}}
					>
						{title}
					</Text>
					<TextInput
						autoFocus
						value={value}
						onChangeText={setValue}
						placeholder={placeholder}
						placeholderTextColor={theme.textDim}
						selectionColor={theme.foreground}
						onSubmitEditing={() => trimmed && onConfirm(trimmed)}
						style={{
							color: theme.foreground,
							fontSize: 15,
							backgroundColor: theme.input,
							borderWidth: 1,
							borderColor: theme.border,
							borderRadius: theme.radius + 2,
							paddingHorizontal: 12,
							paddingVertical: 10,
						}}
					/>
					<View
						style={{
							flexDirection: "row",
							justifyContent: "flex-end",
							gap: 8,
							marginTop: 18,
						}}
					>
						<ModalButton label="Cancel" onPress={onCancel} />
						<ModalButton
							label={confirmLabel}
							bold
							disabled={!trimmed}
							onPress={() => onConfirm(trimmed)}
						/>
					</View>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}

function ModalButton({
	label,
	onPress,
	bold,
	disabled,
}: {
	label: string;
	onPress: () => void;
	bold?: boolean;
	disabled?: boolean;
}) {
	const { theme } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			hitSlop={8}
			style={{ paddingHorizontal: 12, paddingVertical: 7 }}
		>
			<Text
				style={{
					color: disabled ? theme.textDim : theme.foreground,
					fontSize: 14,
					fontWeight: bold ? "700" : "500",
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}
