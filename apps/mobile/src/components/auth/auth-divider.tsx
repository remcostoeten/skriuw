import { Text, View } from "react-native";
import { authSurface as ui } from "@/theme/colors";

type Props = {
	label: string;
};

export function AuthDivider({ label }: Props) {
	return (
		<View
			accessibilityRole="none"
			style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
		>
			<View style={{ flex: 1, height: 1, backgroundColor: ui.divider, opacity: 0.2 }} />
			<Text
				style={{
					color: ui.textMuted,
					fontSize: 12,
					textTransform: "uppercase",
					letterSpacing: 0.6,
				}}
			>
				{label}
			</Text>
			<View style={{ flex: 1, height: 1, backgroundColor: ui.divider, opacity: 0.2 }} />
		</View>
	);
}
