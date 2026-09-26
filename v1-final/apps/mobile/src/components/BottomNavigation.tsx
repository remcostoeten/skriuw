import { usePathname, useRouter } from "expo-router";
import { BookHeart, FileText, Search, Settings, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme/theme-provider";

export function BottomNavigation() {
	const pathname = usePathname();
	const router = useRouter();
	const { theme } = useTheme();

	return (
		<SafeAreaView edges={["bottom"]} style={{ backgroundColor: theme.toolbar }}>
			<View
				style={{
					flexDirection: "row",
					borderTopWidth: 1,
					borderTopColor: theme.divider,
					paddingHorizontal: 8,
					paddingTop: 7,
					paddingBottom: 4,
				}}
			>
				<NavigationButton
					label="Notes"
					icon={FileText}
					active={pathname === "/"}
					onPress={() => router.replace("/(app)")}
				/>
				<NavigationButton
					label="Journal"
					icon={BookHeart}
					active={pathname === "/journal"}
					onPress={() => router.replace("/(app)/journal")}
				/>
				<NavigationButton
					label="Search"
					icon={Search}
					active={pathname === "/search"}
					onPress={() => router.push("/(app)/search")}
				/>
				<NavigationButton
					label="Settings"
					icon={Settings}
					active={pathname === "/settings"}
					onPress={() => router.replace("/(app)/settings")}
				/>
			</View>
		</SafeAreaView>
	);
}

function NavigationButton({
	label,
	icon: Icon,
	active,
	onPress,
}: {
	label: string;
	icon: LucideIcon;
	active: boolean;
	onPress: () => void;
}) {
	const { theme } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="tab"
			accessibilityLabel={label}
			accessibilityState={{ selected: active }}
			style={({ pressed }) => ({
				flex: 1,
				minHeight: 44,
				alignItems: "center",
				gap: 2,
				paddingVertical: 6,
				marginHorizontal: 2,
				borderRadius: 10,
				backgroundColor: active ? theme.bgActive : "transparent",
				opacity: pressed ? 0.72 : 1,
				transform: [{ scale: pressed ? 0.97 : 1 }],
			})}
		>
			<Icon
				size={19}
				color={active ? theme.foreground : theme.textSecondary}
				strokeWidth={active ? 2.25 : 1.75}
			/>
			<Text
				style={{
					color: active ? theme.foreground : theme.textSecondary,
					fontSize: 10,
					fontWeight: active ? "600" : "400",
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}
