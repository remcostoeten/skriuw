import { useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { signIn, signUp } from "@/auth/auth-client";
import { GithubIcon } from "@/components/github-icon";
import { SkriuwLogo } from "@/components/SkriuwLogo";
import { authSurface as ui } from "@/theme/colors";

const CONTROL_HEIGHT = 44;

type Mode = "signin" | "signup";

const COPY = {
	signin: {
		title: "Welcome back",
		subtitle: "Sign in to sync your notes anywhere",
		submit: "Sign in",
		switchPrompt: "Don't have an account?",
		switchAction: "Register",
	},
	signup: {
		title: "Create an account",
		subtitle: "Create an account to back up and sync your notes",
		submit: "Create account",
		switchPrompt: "Already have an account?",
		switchAction: "Sign in",
	},
} as const;

export default function SignInScreen() {
	const [mode, setMode] = useState<Mode>("signin");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [social, setSocial] = useState(false);

	const busy = loading || social;
	const copy = COPY[mode];
	const canSubmit =
		mode === "signin" ? Boolean(email && password) : Boolean(email && password && confirm);

	function toggleMode() {
		setError(null);
		setConfirm("");
		setMode((m) => (m === "signin" ? "signup" : "signin"));
	}

	async function onSubmit() {
		if (mode === "signup" && password !== confirm) {
			setError("Passwords don't match");
			return;
		}
		setError(null);
		setLoading(true);
		try {
			if (mode === "signin") {
				const res = await signIn.email({ email, password });
				if (res.error) setError(res.error.message ?? "Sign in failed");
			} else {
				const name = email.split("@")[0] || "Skriuw user";
				const res = await signUp.email({ email, password, name });
				if (res.error) setError(res.error.message ?? "Sign up failed");
			}
		} catch {
			setError("Network error. Check your connection and try again.");
		} finally {
			setLoading(false);
		}
	}

	async function onGithub() {
		setError(null);
		setSocial(true);
		try {
			const res = await signIn.social({
				provider: "github",
				callbackURL: Linking.createURL("/"),
			});
			if (res.error) setError(res.error.message ?? "GitHub sign in failed");
		} catch {
			setError("Network error. Check your connection and try again.");
		} finally {
			setSocial(false);
		}
	}

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: ui.bg }}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				style={{ flex: 1 }}
			>
				<ScrollView
					contentContainerStyle={{
						flexGrow: 1,
						justifyContent: "center",
						padding: 24,
					}}
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
				>
					<View style={{ width: "100%", maxWidth: 440, alignSelf: "center" }}>
						<View style={{ marginBottom: 34 }}>
							<SkriuwLogo size={34} color={ui.text} />
						</View>

						<Text
							style={{
								color: ui.textSubtle,
								fontSize: 29,
								fontWeight: "400",
								lineHeight: 38,
								letterSpacing: -0.7,
								marginBottom: 36,
							}}
						>
							Keep your{" "}
							<Text style={{ color: ui.text, fontFamily: "serif" }}>notes</Text> and{" "}
							<Text style={{ color: ui.text, fontFamily: "serif" }}>journal</Text> in
							sync with{" "}
							<Text style={{ color: ui.text, fontFamily: "serif" }}>Skriuw</Text>
						</Text>

						<View
							style={{
								borderTopWidth: 1,
								borderTopColor: ui.cardBorder,
								paddingTop: 28,
							}}
						>
							<Text
								style={{
									color: ui.text,
									fontSize: 24,
									fontWeight: "500",
									letterSpacing: -0.5,
									marginBottom: 6,
								}}
							>
								{copy.title}
							</Text>
							<Text
								style={{
									color: ui.textSubtle,
									fontSize: 14,
									letterSpacing: 0.14,
									marginBottom: 26,
								}}
							>
								{copy.subtitle}
							</Text>

							<Pressable
								onPress={onGithub}
								disabled={busy}
								style={({ pressed }) => ({
									height: CONTROL_HEIGHT,
									flexDirection: "row",
									justifyContent: "center",
									alignItems: "center",
									gap: 12,
									backgroundColor: pressed
										? "rgba(255,255,255,0.04)"
										: ui.inputBg,
									borderWidth: 1,
									borderColor: ui.border,
									paddingHorizontal: 20,
									opacity: busy ? 0.55 : 1,
								})}
							>
								{social ? (
									<ActivityIndicator color={ui.text} />
								) : (
									<>
										<GithubIcon size={17} color={ui.text} />
										<Text
											style={{
												color: ui.text,
												fontSize: 14,
												fontWeight: "500",
												letterSpacing: 0.14,
											}}
										>
											Continue with GitHub
										</Text>
									</>
								)}
							</Pressable>

							<View
								style={{
									flexDirection: "row",
									alignItems: "center",
									marginVertical: 22,
								}}
							>
								<View style={{ flex: 1, height: 1, backgroundColor: ui.divider }} />
								<Text
									style={{
										color: ui.textMuted,
										fontSize: 11,
										textTransform: "uppercase",
										letterSpacing: 1,
										marginHorizontal: 12,
									}}
								>
									or continue with
								</Text>
								<View style={{ flex: 1, height: 1, backgroundColor: ui.divider }} />
							</View>

							<Field
								label="Email"
								value={email}
								onChangeText={setEmail}
								keyboardType="email-address"
								autoCapitalize="none"
								autoComplete="email"
								placeholder="you@example.com"
							/>
							<Field
								label="Password"
								value={password}
								onChangeText={setPassword}
								secureTextEntry
								autoComplete={mode === "signin" ? "password" : "password-new"}
								placeholder="••••••••"
							/>
							{mode === "signup" ? (
								<Field
									label="Confirm password"
									value={confirm}
									onChangeText={setConfirm}
									secureTextEntry
									autoComplete="password-new"
									placeholder="••••••••"
								/>
							) : null}

							{error ? (
								<Text
									style={{
										color: ui.error,
										fontSize: 13,
										marginTop: 4,
										marginBottom: 12,
									}}
								>
									{error}
								</Text>
							) : null}

							<Pressable
								onPress={onSubmit}
								disabled={busy || !canSubmit}
								style={({ pressed }) => ({
									height: CONTROL_HEIGHT,
									backgroundColor: ui.primary,
									alignItems: "center",
									justifyContent: "center",
									marginTop: error ? 0 : 10,
									opacity: busy || !canSubmit ? 0.35 : pressed ? 0.85 : 1,
								})}
							>
								{loading ? (
									<ActivityIndicator color={ui.onPrimary} />
								) : (
									<Text
										style={{
											color: ui.onPrimary,
											fontSize: 14,
											fontWeight: "600",
											letterSpacing: 0.14,
										}}
									>
										{copy.submit}
									</Text>
								)}
							</Pressable>

							<View
								style={{
									flexDirection: "row",
									justifyContent: "center",
									alignItems: "center",
									gap: 5,
									marginTop: 22,
								}}
							>
								<Text style={{ color: ui.textSubtle, fontSize: 13 }}>
									{copy.switchPrompt}
								</Text>
								<Pressable onPress={toggleMode} disabled={busy} hitSlop={8}>
									<Text
										style={{
											color: ui.text,
											fontSize: 13,
											fontWeight: "500",
											textDecorationLine: "underline",
										}}
									>
										{copy.switchAction}
									</Text>
								</Pressable>
							</View>
						</View>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

type FieldProps = { label: string } & React.ComponentProps<typeof TextInput>;

function Field({ label, ...props }: FieldProps) {
	const [focused, setFocused] = useState(false);
	return (
		<View style={{ marginBottom: 14 }}>
			<Text
				style={{
					color: ui.textMuted,
					fontSize: 13,
					fontWeight: "500",
					marginBottom: 8,
				}}
			>
				{label}
			</Text>
			<TextInput
				{...props}
				onFocus={(e) => {
					setFocused(true);
					props.onFocus?.(e);
				}}
				onBlur={(e) => {
					setFocused(false);
					props.onBlur?.(e);
				}}
				placeholderTextColor={ui.textSubtle}
				style={{
					height: CONTROL_HEIGHT,
					backgroundColor: ui.inputBg,
					borderWidth: 1,
					borderColor: focused ? ui.borderFocus : ui.border,
					paddingHorizontal: 16,
					color: ui.text,
					fontSize: 14,
					letterSpacing: 0.14,
				}}
			/>
		</View>
	);
}
