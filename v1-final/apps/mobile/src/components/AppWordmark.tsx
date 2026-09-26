import { StyleSheet, Text, View } from "react-native";
import { SkriuwLogo } from "@/components/SkriuwLogo";
import { useTheme } from "@/theme/theme-provider";

export function AppWordmark({ section }: { section?: string }) {
	const { theme } = useTheme();
	return (
		<View style={styles.root}>
			<View style={[styles.mark, { borderColor: theme.border, backgroundColor: theme.card }]}>
				<SkriuwLogo size={19} color={theme.foreground} />
			</View>
			<View>
				<Text style={[styles.name, { color: theme.foreground }]}>Skriuw</Text>
				{section ? (
					<Text style={[styles.section, { color: theme.textDim }]}>
						{section.toUpperCase()}
					</Text>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flexDirection: "row", alignItems: "center", gap: 9 },
	mark: {
		width: 27,
		height: 27,
		borderRadius: 8,
		borderWidth: StyleSheet.hairlineWidth,
		alignItems: "center",
		justifyContent: "center",
	},
	name: {
		fontFamily: "serif",
		fontSize: 19,
		fontWeight: "700",
		letterSpacing: -0.45,
		lineHeight: 20,
	},
	section: { fontSize: 7, fontWeight: "800", letterSpacing: 1.65, marginTop: 1 },
});
