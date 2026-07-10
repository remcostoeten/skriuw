import "react-native-gesture-handler";
import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View } from "react-native";
import { AppProviders } from "@/providers/AppProviders";
import { useSession } from "@/auth/auth-client";
import { ThemeProvider, useTheme } from "@/theme/theme-provider";

/** Redirects between the (auth) and (app) groups based on session state. */
function AuthGate() {
	const { data: session, isPending } = useSession();
	const segments = useSegments();
	const router = useRouter();

	useEffect(() => {
		if (isPending) return;
		const inAuthGroup = segments[0] === "(auth)";
		if (!session && !inAuthGroup) {
			router.replace("/(auth)/sign-in");
		} else if (session && inAuthGroup) {
			router.replace("/(app)");
		}
	}, [session, isPending, segments, router]);

	return <Slot />;
}

function ThemedRoot() {
	const { theme } = useTheme();
	return (
		<View style={{ flex: 1, backgroundColor: theme.background }}>
			<StatusBar style={theme.isDark ? "light" : "dark"} />
			<AppProviders>
				<AuthGate />
			</AppProviders>
		</View>
	);
}

export default function RootLayout() {
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SafeAreaProvider>
				<ThemeProvider>
					<ThemedRoot />
				</ThemeProvider>
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}
