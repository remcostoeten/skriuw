"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { redirect } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { useAuth } from "@/core/auth/use-auth";
import { AuthDrawer, AuthProvider } from "@remcostoeten/auth-drawer";
import type { AuthConfig } from "@remcostoeten/auth-drawer";
import { authDrawerAdapter } from "@/features/auth/auth-drawer-adapter";
import { resolveAuthError } from "@/app/(auth)/auth-errors";
import { GUEST_SIGNUP_PROMPT_EVENT, isTauriRuntime } from "@/core/workspace-backend";
import { showUserToast } from "@/shared/lib/user-toast";
import { authClient } from "@/lib/auth-client";
import {
	OPEN_AUTH_DRAWER_EVENT,
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

function PasskeySignInButton({ onSignedIn }: { onSignedIn: () => void }) {
	const [isPending, setIsPending] = useState(false);

	return (
		<button
			type="button"
			disabled={isPending}
			onClick={async () => {
				setIsPending(true);
				try {
					const { error } = await authClient.signIn.passkey();
					if (error) throw new Error(error.message ?? "Passkey sign-in failed");
					onSignedIn();
				} catch (error) {
					showUserToast(
						error instanceof Error ? error.message : "Passkey sign-in failed",
						"error",
					);
				} finally {
					setIsPending(false);
				}
			}}
			className="flex w-full items-center justify-center gap-2 border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
		>
			<KeyRound className="size-4" aria-hidden />
			{isPending ? "Waiting for passkey…" : "Sign in with a passkey"}
		</button>
	);
}

export function AuthDrawerHost() {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();
	const auth = useAuth();
	const [authDrawerOpen, setAuthDrawerOpen] = useState(false);
	const [authDrawerInitialMode, setAuthDrawerInitialMode] =
		useState<AuthDrawerInitialMode>("login");
	const authDestinationRef = useRef<string | null>(null);
	const finishAuthentication = useCallback(() => {
		setAuthDrawerOpen(false);
		const destination = authDestinationRef.current;
		if (destination && destination !== pathname) {
			router.push(destination);
		} else {
			router.refresh();
		}
		authDestinationRef.current = null;
	}, [pathname, router]);
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
					footer: <PasskeySignInButton onSignedIn={finishAuthentication} />,
				},
			}) satisfies AuthConfig,
		[authDrawerInitialMode, finishAuthentication],
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

	return (
		<AuthProvider adapter={authDrawerAdapter}>
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
				onSuccess={finishAuthentication}
				onError={(error) => {
					const fallbackMessage =
						error instanceof Error
							? error.message
							: typeof error === "object" && error && "message" in error
								? String((error as { message?: unknown }).message ?? "")
								: typeof error === "string"
									? error
									: "Authentication failed";

					const notice = resolveAuthError(new Error(fallbackMessage));
					showUserToast(`${notice.title}: ${notice.message}`, "error");
				}}
				config={activeAuthDrawerConfig}
			/>
		</AuthProvider>
	);
}
