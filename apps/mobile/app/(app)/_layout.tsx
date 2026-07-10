import { Stack } from "expo-router";
import { useTheme } from "@/theme/theme-provider";

export default function AppLayout() {
	const { theme } = useTheme();
	return (
		<Stack
			screenOptions={{
				headerStyle: { backgroundColor: theme.toolbar },
				headerTintColor: theme.foreground,
				headerTitleStyle: { color: theme.foreground },
				contentStyle: { backgroundColor: theme.background },
			}}
		>
			<Stack.Screen name="index" options={{ title: "Notes" }} />
			<Stack.Screen name="folder/[folderId]" options={{ title: "Folder" }} />
			<Stack.Screen name="note/new" options={{ title: "New note", presentation: "modal" }} />
			<Stack.Screen name="note/[id]" options={{ title: "" }} />
			<Stack.Screen name="search" options={{ title: "Search", presentation: "modal" }} />
			<Stack.Screen name="settings" options={{ title: "Settings" }} />
		</Stack>
	);
}
