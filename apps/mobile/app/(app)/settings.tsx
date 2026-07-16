import { useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Check, Database, LogOut, Trash2 } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { signOut, useSession } from "@/auth/auth-client";
import { getApiBaseUrl } from "@/lib/config";
import { queryClient } from "@/query/client";
import { useTheme } from "@/theme/theme-provider";
import { themeList, themes, type TThemeName } from "@/theme/tokens";
import {
	useMobilePreferences,
	type EditorFontSize,
	type EditorLineHeight,
} from "@/preferences/preferences-provider";

export default function SettingsScreen() {
	const { data: session } = useSession();
	const { theme } = useTheme();
	const [clearing, setClearing] = useState(false);
	const userId = session?.user?.id ?? "anon";

	const clearOfflineData = () => {
		Alert.alert(
			"Clear offline data?",
			"Previously opened notes will no longer be available offline. Your cloud notes stay safe.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Clear",
					style: "destructive",
					onPress: async () => {
						setClearing(true);
						try {
							queryClient.clear();
							await AsyncStorage.removeItem(`skriuw-rq-cache:${userId}`);
						} finally {
							setClearing(false);
						}
					},
				},
			],
		);
	};

	return (
		<SafeAreaView
			edges={["left", "right"]}
			style={{ flex: 1, backgroundColor: theme.background }}
		>
			<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
				<Section title="Account" description="Profile and sign-in">
					<InfoRow label="Email" value={session?.user?.email ?? "—"} />
					<InfoRow
						label="Workspace"
						value={getApiBaseUrl().replace(/^https?:\/\//, "")}
					/>
				</Section>

				<Section title="Appearance" description="Theme and color">
					<ThemePicker />
				</Section>

				<EditorSettings />

				<Section title="Data & sync" description="Offline storage and cloud sync">
					<InfoRow label="Sync" value="Cloud workspace" />
					<ActionRow
						icon={<Trash2 size={18} color={theme.mutedForeground} />}
						label="Trash"
						description="Restore or permanently delete removed notes"
						onPress={() => router.push("/trash")}
					/>
					<ActionRow
						icon={<Database size={18} color={theme.mutedForeground} />}
						label={clearing ? "Clearing…" : "Clear offline data"}
						description="Remove cached note bodies from this device"
						onPress={clearOfflineData}
						disabled={clearing}
					/>
				</Section>

				<Section title="About" description="App information">
					<InfoRow label="Version" value={Constants.expoConfig?.version ?? "0.1.0"} />
					<InfoRow label="Offline access" value="Opened notes cached for 7 days" />
				</Section>

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
						paddingVertical: 11,
					}}
				>
					<LogOut size={18} color={theme.destructive} />
					<Text style={{ color: theme.destructive, fontSize: 16, fontWeight: "600" }}>
						Sign out
					</Text>
				</Pressable>
			</ScrollView>
		</SafeAreaView>
	);
}

function Section({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: ReactNode;
}) {
	const { theme } = useTheme();
	return (
		<View style={{ marginBottom: 26 }}>
			<Text style={{ color: theme.foreground, fontSize: 18, fontWeight: "700" }}>
				{title}
			</Text>
			<Text
				style={{
					color: theme.mutedForeground,
					fontSize: 13,
					marginTop: 3,
					marginBottom: 10,
				}}
			>
				{description}
			</Text>
			<View
				style={{
					backgroundColor: theme.card,
					borderWidth: 1,
					borderColor: theme.border,
					borderRadius: theme.radius + 6,
					paddingHorizontal: 14,
				}}
			>
				{children}
			</View>
		</View>
	);
}

function EditorSettings() {
	const { theme } = useTheme();
	const {
		editorFontSize,
		setEditorFontSize,
		editorLineHeight,
		setEditorLineHeight,
		spellCheck,
		setSpellCheck,
	} = useMobilePreferences();
	return (
		<Section title="Editor" description="Writing experience">
			<ControlRow label="Text size" description="Markdown editor font size">
				<SegmentedControl<EditorFontSize>
					value={editorFontSize}
					onChange={setEditorFontSize}
					options={[
						["small", "S"],
						["medium", "M"],
						["large", "L"],
					]}
				/>
			</ControlRow>
			<ControlRow label="Line spacing" description="Space between editor lines">
				<SegmentedControl<EditorLineHeight>
					value={editorLineHeight}
					onChange={setEditorLineHeight}
					options={[
						["compact", "Tight"],
						["comfortable", "Normal"],
						["relaxed", "Wide"],
					]}
				/>
			</ControlRow>
			<ControlRow label="Spell check" description="Suggestions and auto-correction">
				<Switch
					value={spellCheck}
					onValueChange={setSpellCheck}
					trackColor={{ false: theme.border, true: theme.foreground }}
					thumbColor={spellCheck ? theme.background : theme.mutedForeground}
				/>
			</ControlRow>
		</Section>
	);
}

function ThemePicker() {
	const { name, setTheme } = useTheme();
	return (
		<View style={{ flexDirection: "row", gap: 8, paddingVertical: 10 }}>
			{themeList.map((option) => (
				<ThemePreviewCard
					key={option.name}
					themeName={option.name}
					label={option.label}
					selected={name === option.name}
					onPress={() => setTheme(option.name)}
				/>
			))}
		</View>
	);
}

function ThemePreviewCard({
	themeName,
	label,
	selected,
	onPress,
}: {
	themeName: TThemeName;
	label: string;
	selected: boolean;
	onPress: () => void;
}) {
	const preview = themes[themeName];
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="radio"
			accessibilityState={{ checked: selected }}
			style={{
				flex: 1,
				height: 112,
				borderRadius: 9,
				backgroundColor: preview.background,
				overflow: "hidden",
				padding: 10,
			}}
		>
			<View
				style={{
					height: 12,
					flexDirection: "row",
					alignItems: "center",
					gap: 3,
					marginBottom: 6,
					borderBottomWidth: 1,
					borderBottomColor: preview.divider,
				}}
			>
				<View
					style={{
						width: 4,
						height: 4,
						borderRadius: 2,
						backgroundColor: preview.destructive,
					}}
				/>
				<View
					style={{
						width: 4,
						height: 4,
						borderRadius: 2,
						backgroundColor: preview.warning,
					}}
				/>
				<View
					style={{
						width: 4,
						height: 4,
						borderRadius: 2,
						backgroundColor: preview.success,
					}}
				/>
				<View style={{ flex: 1 }} />
				<View
					style={{
						width: 18,
						height: 3,
						borderRadius: 2,
						backgroundColor: preview.border,
					}}
				/>
			</View>
			<View style={{ flexDirection: "row", gap: 6, flex: 1 }}>
				<View
					style={{
						width: 18,
						borderRadius: 4,
						backgroundColor: preview.bgDeep,
						paddingHorizontal: 4,
						paddingTop: 8,
						gap: 5,
					}}
				>
					<View
						style={{
							height: 3,
							borderRadius: 2,
							backgroundColor: preview.mutedForeground,
						}}
					/>
					<View style={{ height: 3, borderRadius: 2, backgroundColor: preview.border }} />
					<View style={{ height: 3, borderRadius: 2, backgroundColor: preview.border }} />
					<View
						style={{
							height: 3,
							borderRadius: 2,
							backgroundColor: preview.mutedForeground,
						}}
					/>
					<View style={{ height: 3, borderRadius: 2, backgroundColor: preview.border }} />
				</View>
				<View style={{ flex: 1, paddingTop: 7, gap: 6 }}>
					<View
						style={{
							width: "70%",
							height: 5,
							borderRadius: 3,
							backgroundColor: preview.foreground,
						}}
					/>
					<View style={{ height: 3, borderRadius: 2, backgroundColor: preview.border }} />
					<View
						style={{
							width: "82%",
							height: 3,
							borderRadius: 2,
							backgroundColor: preview.border,
						}}
					/>
					<View
						style={{
							width: "90%",
							height: 3,
							borderRadius: 2,
							backgroundColor: preview.border,
						}}
					/>
					<View
						style={{
							marginTop: 2,
							height: 18,
							borderRadius: 4,
							backgroundColor: preview.card,
							padding: 5,
							gap: 3,
						}}
					>
						<View
							style={{
								width: "72%",
								height: 3,
								borderRadius: 2,
								backgroundColor: preview.mutedForeground,
							}}
						/>
						<View
							style={{
								width: "90%",
								height: 3,
								borderRadius: 2,
								backgroundColor: preview.border,
							}}
						/>
					</View>
				</View>
			</View>
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "space-between",
					marginTop: 8,
				}}
			>
				<Text style={{ color: preview.foreground, fontSize: 11, fontWeight: "700" }}>
					{label}
				</Text>
				{selected ? (
					<View
						style={{
							width: 16,
							height: 16,
							borderRadius: 8,
							alignItems: "center",
							justifyContent: "center",
							backgroundColor: preview.foreground,
						}}
					>
						<Check size={11} color={preview.background} strokeWidth={3} />
					</View>
				) : null}
			</View>
		</Pressable>
	);
}

function InfoRow({ label, value }: { label: string; value: string }) {
	const { theme } = useTheme();
	return (
		<View
			style={{ paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.divider }}
		>
			<Text style={{ color: theme.mutedForeground, fontSize: 12 }}>{label}</Text>
			<Text style={{ color: theme.foreground, fontSize: 15, marginTop: 3 }}>{value}</Text>
		</View>
	);
}

function ControlRow({
	label,
	description,
	children,
}: {
	label: string;
	description: string;
	children: ReactNode;
}) {
	const { theme } = useTheme();
	return (
		<View
			style={{
				paddingVertical: 11,
				borderBottomWidth: 1,
				borderBottomColor: theme.divider,
				gap: 10,
			}}
		>
			<View>
				<Text style={{ color: theme.foreground, fontSize: 15, fontWeight: "600" }}>
					{label}
				</Text>
				<Text style={{ color: theme.mutedForeground, fontSize: 12, marginTop: 2 }}>
					{description}
				</Text>
			</View>
			{children}
		</View>
	);
}

function ActionRow({
	icon,
	label,
	description,
	onPress,
	disabled,
}: {
	icon: ReactNode;
	label: string;
	description: string;
	onPress: () => void;
	disabled?: boolean;
}) {
	const { theme } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: 12,
				paddingVertical: 11,
				opacity: disabled ? 0.5 : 1,
			}}
		>
			{icon}
			<View style={{ flex: 1 }}>
				<Text style={{ color: theme.foreground, fontSize: 15, fontWeight: "600" }}>
					{label}
				</Text>
				<Text style={{ color: theme.mutedForeground, fontSize: 12, marginTop: 2 }}>
					{description}
				</Text>
			</View>
		</Pressable>
	);
}

function SegmentedControl<T extends string>({
	value,
	onChange,
	options,
}: {
	value: T;
	onChange: (value: T) => void;
	options: readonly (readonly [T, string])[];
}) {
	const { theme } = useTheme();
	return (
		<View
			style={{
				flexDirection: "row",
				backgroundColor: theme.input,
				borderRadius: theme.radius + 2,
				padding: 3,
			}}
		>
			{options.map(([option, label]) => {
				const selected = option === value;
				return (
					<Pressable
						key={option}
						onPress={() => onChange(option)}
						accessibilityRole="radio"
						accessibilityState={{ checked: selected }}
						style={{
							flex: 1,
							alignItems: "center",
							paddingVertical: 7,
							borderRadius: theme.radius,
							backgroundColor: selected ? theme.card : "transparent",
						}}
					>
						<Text
							style={{
								color: selected ? theme.foreground : theme.mutedForeground,
								fontSize: 12,
								fontWeight: selected ? "700" : "500",
							}}
						>
							{label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}
