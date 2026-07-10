import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogOut } from "lucide-react-native";
import { signOut, useSession } from "@/auth/auth-client";
import { getApiBaseUrl } from "@/lib/config";
import { useTheme } from "@/theme/theme-provider";
import { themeList, themes, type TThemeName } from "@/theme/tokens";

export default function SettingsScreen() {
	const { data: session } = useSession();
	const { theme } = useTheme();

	return (
		<SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
			<View style={{ padding: 16 }}>
				<Row label="Signed in as" value={session?.user?.email ?? "—"} />
				<Row label="Workspace" value={getApiBaseUrl().replace(/^https?:\/\//, "")} />

				<ThemePicker />

				<Pressable
					onPress={() => signOut()}
					style={{
						marginTop: 28,
						flexDirection: "row",
						justifyContent: "center",
						alignItems: "center",
						gap: 8,
						backgroundColor: theme.card,
						borderWidth: 1,
						borderColor: theme.border,
						borderRadius: theme.radius + 4,
						paddingVertical: 14,
					}}
				>
					<LogOut size={18} color={theme.destructive} strokeWidth={2} />
					<Text style={{ color: theme.destructive, fontSize: 16, fontWeight: "600" }}>
						Sign out
					</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

function ThemePicker() {
	const { theme, name, setTheme } = useTheme();
	return (
		<View style={{ marginTop: 24 }}>
			<Text style={{ color: theme.mutedForeground, fontSize: 12, marginBottom: 10 }}>
				Theme
			</Text>
			<View
				style={{
					flexDirection: "row",
					gap: 8,
				}}
			>
				{themeList.map((option) => (
					<ThemeSwatch
						key={option.name}
						optionName={option.name}
						label={option.label}
						selected={name === option.name}
						onPress={() => setTheme(option.name)}
					/>
				))}
			</View>
		</View>
	);
}

function ThemeSwatch({
	optionName,
	label,
	selected,
	onPress,
}: {
	optionName: TThemeName;
	label: string;
	selected: boolean;
	onPress: () => void;
}) {
	const { theme } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			style={{
				flex: 1,
				backgroundColor: theme.card,
				borderWidth: 1,
				borderColor: selected ? theme.foreground : theme.border,
				borderRadius: theme.radius + 4,
				paddingVertical: 12,
				alignItems: "center",
				gap: 8,
			}}
		>
			<ThemePreviewDot themeName={optionName} />
			<Text
				style={{
					color: selected ? theme.foreground : theme.mutedForeground,
					fontSize: 13,
					fontWeight: selected ? "600" : "400",
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}

function ThemePreviewDot({ themeName }: { themeName: TThemeName }) {
	const preview = themes[themeName];
	return (
		<View
			style={{
				width: 34,
				height: 22,
				borderRadius: 5,
				backgroundColor: preview.background,
				borderWidth: 1,
				borderColor: preview.border,
				overflow: "hidden",
				justifyContent: "center",
				paddingLeft: 5,
			}}
		>
			<View
				style={{
					width: 16,
					height: 3,
					borderRadius: 2,
					backgroundColor: preview.foreground,
				}}
			/>
			<View
				style={{
					width: 10,
					height: 3,
					borderRadius: 2,
					marginTop: 3,
					backgroundColor: preview.mutedForeground,
				}}
			/>
		</View>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	const { theme } = useTheme();
	return (
		<View
			style={{
				paddingVertical: 14,
				borderBottomWidth: 1,
				borderBottomColor: theme.divider,
			}}
		>
			<Text style={{ color: theme.mutedForeground, fontSize: 12, marginBottom: 4 }}>
				{label}
			</Text>
			<Text style={{ color: theme.foreground, fontSize: 16 }}>{value}</Text>
		</View>
	);
}
