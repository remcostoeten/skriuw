import { Stack } from "expo-router";
import { authSurface } from "@/theme/colors";

export default function AuthLayout() {
	return (
		<Stack
			screenOptions={{
				headerShown: false,
				contentStyle: { backgroundColor: authSurface.bg },
			}}
		/>
	);
}
