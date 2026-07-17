import { Stack, usePathname } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { BottomNavigation } from "@/components/BottomNavigation";
import { AppWordmark } from "@/components/AppWordmark";
import { useReducedMotion } from "@/shared/use-reduced-motion";
import { useKeyboardVisible } from "@/shared/use-keyboard-visible";

export default function AppLayout() {
	const { theme } = useTheme();
	const pathname = usePathname();
	const reducedMotion = useReducedMotion();
	const keyboardVisible = useKeyboardVisible();
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
					animation: reducedMotion ? "fade" : "slide_from_right",
					animationDuration: 240,
				}}
			>
				<Stack.Screen
					name="index"
					options={{ headerTitle: () => <AppWordmark section="Workspace" /> }}
				/>
				<Stack.Screen name="folder/[folderId]" options={{ title: "Folder" }} />
				<Stack.Screen
					name="note/new"
					options={{ title: "New note", presentation: "modal" }}
				/>
				<Stack.Screen name="note/[id]" options={{ title: "" }} />
				<Stack.Screen name="search" options={{ title: "Search" }} />
				<Stack.Screen name="journal" options={{ headerShown: false }} />
				<Stack.Screen name="settings" options={{ title: "Settings" }} />
				<Stack.Screen name="trash" options={{ title: "Trash" }} />
			</Stack>
			{showBottomNavigation && !keyboardVisible ? <BottomNavigation /> : null}
		</View>
	);
}
