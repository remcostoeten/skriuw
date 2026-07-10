// Themed bottom-sheet menu. Cross-platform stand-in for ActionSheetIOS, used
// for per-row actions (Rename / Move / Delete).
import type { LucideIcon } from "lucide-react-native";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme/theme-provider";

export type SheetAction = {
	key: string;
	label: string;
	icon?: LucideIcon;
	destructive?: boolean;
	onPress: () => void;
};

type Props = {
	visible: boolean;
	title?: string;
	actions: SheetAction[];
	onClose: () => void;
};

export function ActionSheet({ visible, title, actions, onClose }: Props) {
	const { theme } = useTheme();

	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
			<Pressable
				onPress={onClose}
				style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
			>
				{/* Stop propagation: taps inside the sheet shouldn't dismiss it. */}
				<Pressable
					onPress={() => {}}
					style={{
						backgroundColor: theme.popover,
						borderTopLeftRadius: theme.radius + 12,
						borderTopRightRadius: theme.radius + 12,
						borderTopWidth: 1,
						borderColor: theme.border,
					}}
				>
					<SafeAreaView edges={["bottom"]}>
						{title ? (
							<Text
								numberOfLines={1}
								style={{
									color: theme.mutedForeground,
									fontSize: 13,
									fontWeight: "600",
									paddingHorizontal: 20,
									paddingTop: 16,
									paddingBottom: 4,
								}}
							>
								{title}
							</Text>
						) : (
							<View style={{ height: 8 }} />
						)}
						{actions.map((action) => (
							<Pressable
								key={action.key}
								onPress={() => {
									onClose();
									action.onPress();
								}}
								style={{
									flexDirection: "row",
									alignItems: "center",
									gap: 14,
									paddingHorizontal: 20,
									paddingVertical: 15,
								}}
							>
								{action.icon ? (
									<action.icon
										size={20}
										color={
											action.destructive
												? theme.destructive
												: theme.foreground
										}
										strokeWidth={2}
									/>
								) : null}
								<Text
									style={{
										color: action.destructive
											? theme.destructive
											: theme.foreground,
										fontSize: 16,
										fontWeight: "500",
									}}
								>
									{action.label}
								</Text>
							</Pressable>
						))}
					</SafeAreaView>
				</Pressable>
			</Pressable>
		</Modal>
	);
}
