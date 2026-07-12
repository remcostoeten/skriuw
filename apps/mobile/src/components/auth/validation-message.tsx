import { Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { authSurface as ui } from "@/theme/colors";

type Props = {
	message: string;
	tone: "error" | "success";
	variant?: "inline" | "chip";
};

export function ValidationMessage({ message, tone, variant = "inline" }: Props) {
	const isError = tone === "error";

	if (variant === "chip") {
		return (
			<Animated.View
				entering={FadeIn.duration(180)}
				exiting={FadeOut.duration(120)}
				style={{
					alignSelf: "flex-start",
					borderRadius: 999,
					borderWidth: 1,
					borderColor: isError ? ui.errorBorder : ui.chipBorder,
					backgroundColor: ui.chipBg,
					paddingHorizontal: 10,
					paddingVertical: 5,
				}}
			>
				<Text style={{ color: isError ? ui.error : ui.textMuted, fontSize: 12 }}>
					{message}
				</Text>
			</Animated.View>
		);
	}

	return (
		<Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
			<Text
				accessibilityRole={isError ? "alert" : "text"}
				style={{ color: isError ? ui.error : ui.textMuted, fontSize: 13 }}
			>
				{message}
			</Text>
		</Animated.View>
	);
}
