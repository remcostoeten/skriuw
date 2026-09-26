import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { CheckCircle2, XCircle } from "lucide-react-native";
import { authMetrics, authSurface as ui } from "@/theme/colors";

export type AuthButtonFeedback = {
	tone: "error" | "success";
	message: string;
};

type Props = {
	label: string;
	onPress: () => void;
	icon?: ReactNode;
	disabled?: boolean;
	loading?: boolean;
	feedback?: AuthButtonFeedback | null;
};

export function AuthButton({ label, onPress, icon, disabled, loading, feedback }: Props) {
	const isError = feedback?.tone === "error";

	return (
		<Pressable
			onPress={onPress}
			disabled={disabled || loading}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
			style={({ pressed }) => ({
				height: authMetrics.controlHeight,
				width: "100%",
				borderRadius: authMetrics.buttonRadius,
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "center",
				gap: 12,
				paddingHorizontal: 20,
				borderWidth: 1,
				overflow: "hidden",
				backgroundColor: pressed ? ui.controlBgPressed : ui.controlBg,
				borderColor: isError
					? ui.errorBorder
					: pressed
						? ui.controlBorderPressed
						: ui.controlBorder,
				opacity: disabled || loading ? 0.5 : 1,
			})}
		>
			{loading ? (
				<ActivityIndicator size="small" color={ui.text} />
			) : feedback ? (
				<Animated.View
					entering={FadeIn.duration(180)}
					exiting={FadeOut.duration(180)}
					style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
				>
					{isError ? (
						<XCircle size={14} strokeWidth={2} color={ui.error} />
					) : (
						<CheckCircle2 size={14} strokeWidth={2} color={ui.text} />
					)}
					<Text
						numberOfLines={1}
						style={{
							color: isError ? ui.error : ui.text,
							fontSize: 14,
							fontWeight: "500",
							letterSpacing: 0.14,
						}}
					>
						{feedback.message}
					</Text>
				</Animated.View>
			) : (
				<>
					{icon ? <View>{icon}</View> : null}
					<Text
						style={{
							color: ui.text,
							fontSize: 14,
							fontWeight: "500",
							letterSpacing: 0.14,
						}}
					>
						{label}
					</Text>
				</>
			)}
		</Pressable>
	);
}
