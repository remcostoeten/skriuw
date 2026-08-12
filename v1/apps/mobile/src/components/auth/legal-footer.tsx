import { Text } from "react-native";
import { authSurface as ui } from "@/theme/colors";

export function LegalFooter() {
	return (
		<Text
			style={{
				color: ui.textSubtle,
				fontSize: 11,
				lineHeight: 17,
				textAlign: "center",
				maxWidth: 320,
				alignSelf: "center",
			}}
		>
			By creating an account or signing in, you agree to our{" "}
			<Text style={{ textDecorationLine: "underline" }}>Terms</Text> and{" "}
			<Text style={{ textDecorationLine: "underline" }}>Privacy Policy</Text>.
		</Text>
	);
}
