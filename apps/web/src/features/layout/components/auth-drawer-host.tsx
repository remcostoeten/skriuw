"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { redirect } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/core/auth/use-auth";
import { signInWithOAuth, getRememberMePreference } from "@/core/auth";
import {
	DUPLICATE_OAUTH_EMAIL_EVENT,
	getProviderLabel,
	type DuplicateOAuthEmailDetail,
} from "@/core/auth/connections";
import type { OAuthProvider } from "@/core/auth";
import { AuthDrawer, AuthProvider } from "@remcostoeten/auth-drawer";
import type { AuthConfig } from "@remcostoeten/auth-drawer";
import { authDrawerAdapter } from "@/features/auth/auth-drawer-adapter";
import { resolveAuthError } from "@/app/(auth)/auth-errors";
import { GUEST_SIGNUP_PROMPT_EVENT, isTauriRuntime } from "@/core/workspace-backend";
import { showUserToast } from "@/shared/lib/user-toast";
import {
	OPEN_AUTH_DRAWER_EVENT,
	openAuthDrawer,
	type AuthDrawerInitialMode,
	type OpenAuthDrawerDetail,
} from "@/features/layout/components/open-auth-drawer";

const authDrawerConfig = {
	ui: {
		presentation: { variant: "drawer" },
		visual: {
			// Keep the overlay dark enough to read while still letting a trace of
			// the app background show through the blur.
			backdrop: {
				opacity: 0.94,
				blur: 3,
				gradient: {
					angle: 180,
					from: "hsl(var(--scrim) / 0.12)",
					to: "hsl(var(--scrim) / 0.3)",
					fromPos: 0,
					toPos: 100,
				},
			},
		},
		success: {
			messages: {
				signIn: "Signed in",
				signUp: "Account created",
				oauth: "Signed in",
			},
		},
	},
} satisfies AuthConfig;

function resolveAuthDrawerMode(value: string | null): AuthDrawerInitialMode | null {
	if (value === "sign-in") return "login";
	if (value === "sign-up") return "register";
	return null;
}

function resolveNextDestination(value: string | null): string | null {
	if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
	return value;
}

function getPathWithoutAuthParams(pathname: string, searchParams: URLSearchParams): string {
	const nextParams = new URLSearchParams(searchParams.toString());
	nextParams.delete("auth");
	nextParams.delete("next");

	const query = nextParams.toString();
	return query ? `${pathname}?${query}` : pathname;
}

/**
 * Owns the sign-in/sign-up drawer plus every trigger that opens it: the
 * `?auth=` URL param, protected-route gating, the guest sign-up prompt event,
 * the imperative {@link openAuthDrawer} event, and the duplicate-OAuth-email
 * prompt. Lives inside IconRail on desktop; mobile shells (which hide the
 * rail) must mount it directly or nothing responds to `/app?auth=sign-in`.
 */
export function AuthDrawerHost() {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();
	const auth = useAuth();
	const [authDrawerOpen, setAuthDrawerOpen] = useState(false);
	const [authDrawerInitialMode, setAuthDrawerInitialMode] =
		useState<AuthDrawerInitialMode>("login");
	const authDestinationRef = useRef<string | null>(null);
	const [duplicateOAuth, setDuplicateOAuth] = useState<DuplicateOAuthEmailDetail | null>(null);
	// Desktop is a single local profile with no cloud auth, so nothing is
	// "protected" — gating these would only pop a sign-in drawer that can never
	// resolve and would block the user out of Settings/Journal.
	const protectedRoutes = useMemo(
		() => (isTauriRuntime() ? new Set<string>() : new Set(["/app/journal", "/app/shared"])),
		[],
	);
	const activeAuthDrawerConfig = useMemo(
		() =>
			({
				...authDrawerConfig,
				ui: {
					...authDrawerConfig.ui,
					auth: {
						initialMode: authDrawerInitialMode,
					},
				},
			}) satisfies AuthConfig,
		[authDrawerInitialMode],
	);

	useEffect(() => {
		const initialMode = resolveAuthDrawerMode(searchParams.get("auth"));
		if (!initialMode || !auth.isReady) return;

		// react-doctor-disable-next-line react-doctor/url-prefilled-privileged-action -- auth and redirect params are already normalized and bounded before use.
		const destination = resolveNextDestination(searchParams.get("next")) ?? "/app";
		const cleanPath = getPathWithoutAuthParams(pathname, searchParams);

		if (auth.phase === "authenticated") {
			redirect(destination);
			return;
		}

		setAuthDrawerInitialMode(initialMode);
		authDestinationRef.current = destination;
		setAuthDrawerOpen(true);
		window.history.replaceState(null, "", cleanPath);
	}, [auth.isReady, auth.phase, pathname, searchParams]);

	// Intentionally excludes `authDrawerOpen`: this effect only gates entry
	// onto a protected route, it must not re-fire (and reopen the drawer)
	// just because the drawer's own open state changed, or a deliberate
	// dismissal would be immediately undone.
	useEffect(() => {
		if (!auth.isReady || auth.phase === "authenticated") return;
		if (!protectedRoutes.has(pathname)) return;

		authDestinationRef.current = pathname;
		setAuthDrawerOpen(true);
	}, [auth.isReady, auth.phase, pathname, protectedRoutes]);

	useEffect(() => {
		function handleGuestPrompt() {
			router.prefetch("/app");
			setAuthDrawerInitialMode("register");
			authDestinationRef.current = "/app";
			setAuthDrawerOpen(true);
		}
		window.addEventListener(GUEST_SIGNUP_PROMPT_EVENT, handleGuestPrompt);
		return () => window.removeEventListener(GUEST_SIGNUP_PROMPT_EVENT, handleGuestPrompt);
	}, [router]);

	useEffect(() => {
		function handleOpenRequest(event: Event) {
			const detail = (event as CustomEvent<OpenAuthDrawerDetail>).detail;
			if (!detail) return;
			router.prefetch(detail.destination);
			setAuthDrawerInitialMode(detail.mode);
			authDestinationRef.current = detail.destination;
			setAuthDrawerOpen(true);
		}
		window.addEventListener(OPEN_AUTH_DRAWER_EVENT, handleOpenRequest);
		return () => window.removeEventListener(OPEN_AUTH_DRAWER_EVENT, handleOpenRequest);
	}, [router]);

	useEffect(() => {
		function handleDuplicateOAuth(event: Event) {
			const detail = (event as CustomEvent<DuplicateOAuthEmailDetail>).detail;
			if (!detail) return;
			setDuplicateOAuth(detail);
		}
		window.addEventListener(DUPLICATE_OAUTH_EMAIL_EVENT, handleDuplicateOAuth);
		return () => window.removeEventListener(DUPLICATE_OAUTH_EMAIL_EVENT, handleDuplicateOAuth);
	}, []);

	const handleDuplicateOAuthSignIn = async (provider: string) => {
		setDuplicateOAuth(null);
		try {
			await signInWithOAuth(provider as OAuthProvider, {
				rememberMe: getRememberMePreference(),
			});
		} catch (error) {
			const notice = resolveAuthError(
				error instanceof Error ? error : new Error(String(error)),
			);
			showUserToast(`${notice.title}: ${notice.message}`, "error");
		}
	};

	return (
		<AuthProvider adapter={authDrawerAdapter}>
			{duplicateOAuth ? (
				// Not a plain toast: it needs an action, which the shared
				// user-toast-host can't render. z-[110] keeps it above the
				// toast host (z-[100]) instead of overlapping it.
				<div className="fixed bottom-4 left-16 z-[110] w-[min(24rem,calc(100vw-5rem))]">
					<div
						role="alert"
						className="border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur"
					>
						<p className="text-sm font-medium text-foreground">
							Account already exists
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							An account with this email already exists via{" "}
							{getProviderLabel(duplicateOAuth.provider)}. Would you like to sign in
							with {getProviderLabel(duplicateOAuth.provider)} instead?
						</p>
						<div className="mt-3 flex items-center gap-2">
							<button
								type="button"
								onClick={() => handleDuplicateOAuthSignIn(duplicateOAuth.provider)}
								className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
							>
								Sign in with {getProviderLabel(duplicateOAuth.provider)}
							</button>
							<button
								type="button"
								onClick={() => setDuplicateOAuth(null)}
								className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
							>
								Dismiss
							</button>
						</div>
					</div>
				</div>
			) : null}
			<AuthDrawer
				adapter={authDrawerAdapter}
				hideTrigger
				open={authDrawerOpen}
				onOpenChange={(open) => {
					setAuthDrawerOpen(open);
					if (!open) {
						authDestinationRef.current = null;
					}
				}}
				onSuccess={() => {
					setDuplicateOAuth(null);
					const destination = authDestinationRef.current;
					if (destination && destination !== pathname) {
						router.push(destination);
					}
					authDestinationRef.current = null;
				}}
				onError={(error) => {
					const fallbackMessage =
						error instanceof Error
							? error.message
							: typeof error === "object" && error && "message" in error
								? String((error as { message?: unknown }).message ?? "")
								: typeof error === "string"
									? error
									: "Authentication failed";

					// The duplicate-OAuth-email case is surfaced as a richer prompt
					// via DUPLICATE_OAUTH_EMAIL_EVENT, so skip the plain error notice.
					if (fallbackMessage.includes("already exists via")) return;

					const notice = resolveAuthError(new Error(fallbackMessage));
					showUserToast(`${notice.title}: ${notice.message}`, "error");
				}}
				config={activeAuthDrawerConfig}
			/>
		</AuthProvider>
	);
}
