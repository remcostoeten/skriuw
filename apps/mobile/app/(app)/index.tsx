import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, Settings } from "lucide-react-native";
import { WorkspaceList } from "@/components/WorkspaceList";
import { useTheme } from "@/theme/theme-provider";

export default function NotesListScreen() {
	const router = useRouter();
	const { theme } = useTheme();

	return (
		<SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
			<WorkspaceList folderId={null} />

			<Toolbar
				onSearch={() => router.push("/(app)/search")}
				onSettings={() => router.push("/(app)/settings")}
			/>
		</SafeAreaView>
	);
}

function Toolbar({ onSearch, onSettings }: { onSearch: () => void; onSettings: () => void }) {
	const { theme } = useTheme();
	return (
		<View
			style={{
				flexDirection: "row",
				justifyContent: "space-around",
				borderTopWidth: 1,
				borderTopColor: theme.divider,
				backgroundColor: theme.toolbar,
				paddingVertical: 10,
			}}
		>
			<ToolbarButton label="Search" onPress={onSearch} icon={Search} />
			<ToolbarButton label="Settings" onPress={onSettings} icon={Settings} />
		</View>
	);
}

function ToolbarButton({
	label,
	onPress,
	icon: Icon,
}: {
	label: string;
	onPress: () => void;
	icon: typeof Search;
}) {
	const { theme } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityLabel={label}
			hitSlop={8}
			style={{ alignItems: "center", gap: 3, paddingHorizontal: 24, paddingVertical: 2 }}
		>
			<Icon size={20} color={theme.textSecondary} strokeWidth={2} />
			<Text style={{ color: theme.textSecondary, fontSize: 11 }}>{label}</Text>
		</Pressable>
	);
}
