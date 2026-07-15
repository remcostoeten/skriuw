import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import { signIn, signUp } from "@/auth/auth-client";
import { AuthButton, type AuthButtonFeedback } from "@/components/auth/auth-button";
import { AuthDivider } from "@/components/auth/auth-divider";
import { AuthField } from "@/components/auth/auth-field";
import { LegalFooter } from "@/components/auth/legal-footer";
import { ValidationMessage } from "@/components/auth/validation-message";
import { KeyRound } from "lucide-react-native";
import { GithubIcon } from "@/components/github-icon";
import { GoogleIcon } from "@/components/google-icon";
import { SkriuwLogo } from "@/components/SkriuwLogo";
import { authMetrics, authSurface as ui } from "@/theme/colors";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

type Mode = "signin" | "signup";
type FieldName = "name" | "email" | "password" | "confirm";

const COPY = {
	signin: {
		title: "Welcome back",
		subtitle: "Sign in to sync your notes anywhere while keeping local-first saves intact",
		submit: "Sign in",
		success: "Signed in",
		switchPrompt: "Don't have an account?",
		switchAction: "Register",
	},
	signup: {
		title: "Create your account",
		subtitle: "Create an account to back up and sync your notes across devices",
		submit: "Create account",
		success: "Account created",
		switchPrompt: "Already have an account?",
		switchAction: "Sign in",
	},
} as const;

export default function SignInScreen() {
	const [mode, setMode] = useState<Mode>("signin");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
	const [feedback, setFeedback] = useState<AuthButtonFeedback | null>(null);
	const [oauthError, setOauthError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [social, setSocial] = useState<"github" | "google" | null>(null);
	const [passkey, setPasskey] = useState(false);

	const busy = loading || social !== null || passkey;
	const nativePasskeysEnabled =
		Platform.OS === "web" || Constants.expoConfig?.extra?.nativePasskeysEnabled === true;
	const copy = COPY[mode];
	const isSignup = mode === "signup";

	const emailError = !email.trim()
		? "Enter your email address."
		: EMAIL_PATTERN.test(email.trim())
			? null
			: "Enter a valid email address.";
	const passwordError = !password
		? "Enter your password."
		: isSignup && password.length < MIN_PASSWORD_LENGTH
			? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
			: null;
	const confirmError = !confirm ? "Confirm your password." : null;
	const passwordsMatch = password === confirm;

	const canSubmit = isSignup
		? !emailError && !passwordError && !confirmError && passwordsMatch
		: !emailError && !passwordError;

	function markTouched(field: FieldName) {
		setTouched((prev) => ({ ...prev, [field]: true }));
	}

	function toggleMode() {
		setFeedback(null);
		setOauthError(null);
		setTouched({});
		setConfirm("");
		setMode((m) => (m === "signin" ? "signup" : "signin"));
	}

	async function onSubmit() {
		setTouched({ name: true, email: true, password: true, confirm: true });
		if (!canSubmit) return;

		setFeedback(null);
		setOauthError(null);
		setLoading(true);
		try {
			if (mode === "signin") {
				const res = await signIn.email({ email: email.trim(), password });
				if (res.error) {
					setFeedback({ tone: "error", message: res.error.message ?? "Sign in failed" });
					return;
				}
			} else {
				const displayName = name.trim() || email.split("@")[0] || "Skriuw user";
				const res = await signUp.email({
					email: email.trim(),
					password,
					name: displayName,
				});
				if (res.error) {
					setFeedback({ tone: "error", message: res.error.message ?? "Sign up failed" });
					return;
				}
			}
			setFeedback({ tone: "success", message: copy.success });
		} catch {
			setFeedback({
				tone: "error",
				message: "Network error. Check your connection and try again.",
			});
		} finally {
			setLoading(false);
		}
	}

	async function onSocial(provider: "github" | "google") {
		const providerLabel = provider === "github" ? "GitHub" : "Google";
		setFeedback(null);
		setOauthError(null);
		setSocial(provider);
		try {
			const res = await signIn.social({
				provider,
				callbackURL: Linking.createURL("/"),
			});
			if (res.error) setOauthError(res.error.message ?? `${providerLabel} sign in failed`);
		} catch {
			setOauthError("Network error. Check your connection and try again.");
		} finally {
			setSocial(null);
		}
	}

	async function onPasskey() {
		setFeedback(null);
		setOauthError(null);
		setPasskey(true);
		try {
			const res = await signIn.passkey();
			if (res.error) setOauthError(res.error.message ?? "Passkey sign in failed");
		} catch {
			setOauthError("Passkey sign in failed. Try again or use another sign-in method.");
		} finally {
			setPasskey(false);
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
						paddingHorizontal: 24,
						paddingVertical: 32,
					}}
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
				>
					<Animated.View
						entering={FadeInDown.duration(420)}
						style={{
							width: "100%",
							maxWidth: authMetrics.maxWidth,
							alignSelf: "center",
						}}
					>
						<View style={{ alignItems: "center", marginBottom: 24 }}>
							<SkriuwLogo size={30} color={ui.text} />
						</View>

						<View style={{ alignItems: "center", marginBottom: 24 }}>
							<Text
								style={{
									color: ui.text,
									fontFamily: "serif",
									fontSize: 24,
									fontWeight: "500",
									lineHeight: 32,
									letterSpacing: -0.4,
									textAlign: "center",
									marginBottom: 8,
								}}
							>
								{copy.title}
							</Text>
							<Text
								style={{
									color: ui.textMuted,
									fontSize: 14,
									lineHeight: 20,
									textAlign: "center",
								}}
							>
								{copy.subtitle}
							</Text>
						</View>

						<AuthButton
							label="Continue with GitHub"
							onPress={() => onSocial("github")}
							disabled={busy}
							loading={social === "github"}
							icon={<GithubIcon size={16} color={ui.text} />}
						/>
						<View style={{ marginTop: 10 }}>
							<AuthButton
								label="Continue with Google"
								onPress={() => onSocial("google")}
								disabled={busy}
								loading={social === "google"}
								icon={<GoogleIcon size={16} />}
							/>
						</View>
						<View style={{ marginTop: 10 }}>
							<AuthButton
								label={
									nativePasskeysEnabled
										? "Continue with a passkey"
										: "Passkeys unavailable in this build"
								}
								onPress={onPasskey}
								disabled={busy || !nativePasskeysEnabled}
								loading={passkey}
								icon={<KeyRound size={16} color={ui.text} />}
							/>
						</View>

						{oauthError ? (
							<View style={{ marginTop: 6 }}>
								<ValidationMessage tone="error" message={oauthError} />
							</View>
						) : null}

						<View style={{ marginVertical: 24 }}>
							<AuthDivider label="Or continue with email" />
						</View>

						<Animated.View layout={LinearTransition.duration(200)} style={{ gap: 12 }}>
							{isSignup ? (
								<Animated.View
									entering={FadeIn.duration(200)}
									exiting={FadeOut.duration(120)}
								>
									<AuthField
										label="Name"
										value={name}
										onChangeText={setName}
										onBlur={() => markTouched("name")}
										autoCapitalize="words"
										autoComplete="name"
										textContentType="name"
										editable={!busy}
									/>
								</Animated.View>
							) : null}

							<View style={{ gap: 6 }}>
								<AuthField
									label="Email"
									value={email}
									onChangeText={setEmail}
									onBlur={() => markTouched("email")}
									invalid={Boolean(touched.email && emailError)}
									keyboardType="email-address"
									autoCapitalize="none"
									autoCorrect={false}
									autoComplete="email"
									textContentType="emailAddress"
									editable={!busy}
								/>
								{touched.email && emailError ? (
									<ValidationMessage tone="error" message={emailError} />
								) : null}
							</View>

							<View style={{ gap: 6 }}>
								<AuthField
									label="Password"
									value={password}
									onChangeText={setPassword}
									onBlur={() => markTouched("password")}
									invalid={Boolean(touched.password && passwordError)}
									secureTextEntry
									autoCapitalize="none"
									autoComplete={isSignup ? "password-new" : "password"}
									textContentType={isSignup ? "newPassword" : "password"}
									editable={!busy}
								/>
								{touched.password && passwordError ? (
									<ValidationMessage tone="error" message={passwordError} />
								) : null}
							</View>

							{isSignup ? (
								<Animated.View
									entering={FadeIn.duration(200)}
									exiting={FadeOut.duration(120)}
									style={{ gap: 6 }}
								>
									<AuthField
										label="Confirm password"
										value={confirm}
										onChangeText={setConfirm}
										onBlur={() => markTouched("confirm")}
										invalid={Boolean(
											touched.confirm && confirm && !passwordsMatch,
										)}
										secureTextEntry
										autoCapitalize="none"
										autoComplete="password-new"
										textContentType="newPassword"
										editable={!busy}
									/>
									{confirm ? (
										<ValidationMessage
											variant="chip"
											tone={passwordsMatch ? "success" : "error"}
											message={
												passwordsMatch
													? "Passwords match."
													: "Passwords do not match."
											}
										/>
									) : null}
								</Animated.View>
							) : null}
						</Animated.View>

						<View style={{ marginTop: 16 }}>
							<AuthButton
								label={copy.submit}
								onPress={onSubmit}
								disabled={busy}
								loading={loading}
								feedback={feedback}
							/>
						</View>

						<View
							style={{
								flexDirection: "row",
								flexWrap: "wrap",
								justifyContent: "center",
								alignItems: "baseline",
								gap: 8,
								marginTop: 16,
							}}
						>
							<Text style={{ color: ui.textMuted, fontSize: 14 }}>
								{copy.switchPrompt}
							</Text>
							<Pressable onPress={toggleMode} disabled={busy} hitSlop={8}>
								<Text
									style={{
										color: ui.text,
										fontSize: 14,
										textDecorationLine: "underline",
									}}
								>
									{copy.switchAction}
								</Text>
							</Pressable>
						</View>

						<View style={{ marginTop: 20 }}>
							<LegalFooter />
						</View>
					</Animated.View>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
