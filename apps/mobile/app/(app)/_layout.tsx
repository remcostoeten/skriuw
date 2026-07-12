import { Stack, usePathname } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { BottomNavigation } from "@/components/BottomNavigation";

export default function AppLayout() {
	const { theme } = useTheme();
	const pathname = usePathname();
	const showBottomNavigation =
		pathname === "/" ||
		pathname === "/journal" ||
		pathname === "/search" ||
		pathname === "/settings";
	return (
		<View style={{ flex: 1, backgroundColor: theme.background }}>
			<Stack
				screenOptions={{
					headerStyle: { backgroundColor: theme.toolbar },
					headerTintColor: theme.foreground,
					headerTitleStyle: { color: theme.foreground, fontSize: 15, fontWeight: "600" },
					headerShadowVisible: true,
					contentStyle: { backgroundColor: theme.background },
				}}
			>
				<Stack.Screen name="index" options={{ title: "Skriuw" }} />
				<Stack.Screen name="folder/[folderId]" options={{ title: "Folder" }} />
				<Stack.Screen
					name="note/new"
					options={{ title: "New note", presentation: "modal" }}
				/>
				<Stack.Screen name="note/[id]" options={{ title: "" }} />
				<Stack.Screen name="search" options={{ title: "Search" }} />
				<Stack.Screen name="journal" options={{ headerShown: false }} />
				<Stack.Screen name="settings" options={{ title: "Settings" }} />
			</Stack>
			{showBottomNavigation ? <BottomNavigation /> : null}
		</View>
	);
}
