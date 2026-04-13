"use client";

import { Cloud, Github, LoaderCircle, TriangleAlert, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button-component";
import {
  initializeAuth,
  setPrivacyMode,
  signInWithOAuth,
  signInWithPassword,
  signUpWithPassword,
} from "@/platform/auth";
import { useAuthSnapshot } from "@/platform/auth/use-auth";

type Props = {
  children: React.ReactNode;
};

type AuthIntent = "sign-in" | "sign-up" | "google" | "github" | "privacy";

type ScreenShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

type OAuthButtonProps = {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function OAuthButton({ label, icon, loading, disabled, onClick }: OAuthButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full justify-start border-border bg-background px-3 text-left"
      disabled={disabled || loading}
      onClick={onClick}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-border bg-card">
        {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : icon}
      </span>
      <span className="min-w-0 truncate text-sm font-medium">{label}</span>
      {loading && <span className="ml-auto text-xs text-muted-foreground">Connecting</span>}
    </Button>
  );
}

function ScreenShell({ eyebrow, title, description, children }: ScreenShellProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="w-full max-w-[26rem] border border-border bg-card p-6 sm:p-7">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-background">
              <Cloud className="h-4 w-4 text-foreground" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{eyebrow}</p>
              <p className="truncate text-xs text-muted-foreground">Supabase-style auth</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>

        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <ScreenShell
      eyebrow="Authentication"
      title="Preparing session"
      description="Loading your account."
    >
      <div className="flex min-h-[16rem] items-center justify-center border border-border bg-background p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <LoaderCircle className="h-8 w-8 animate-spin text-foreground/70" />
          <p className="text-sm text-muted-foreground">Checking Supabase session…</p>
        </div>
      </div>
    </ScreenShell>
  );
}

function UnconfiguredScreen() {
  const [isPending, setIsPending] = useState(false);

  return (
    <ScreenShell
      eyebrow="Authentication"
      title="Cloud sign-in is unavailable"
      description="Privacy mode is still available."
    >
      <div className="space-y-4 border border-amber-500/30 bg-amber-500/10 p-6 text-sm text-amber-100">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.8} />
          <div className="space-y-3">
            <p className="leading-6 text-amber-100/85">Cloud sign-in is not configured yet.</p>
          </div>
        </div>
        <Button
          type="button"
          className="h-11 w-full"
          disabled={isPending}
          onClick={() => {
            setIsPending(true);
            void setPrivacyMode().finally(() => setIsPending(false));
          }}
        >
          {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
          Continue in privacy mode
        </Button>
      </div>
    </ScreenShell>
  );
}

function SignInScreen() {
  const auth = useAuthSnapshot();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<AuthIntent | null>(null);

  useEffect(() => {
    setRememberMe(auth.rememberMe);
  }, [auth.rememberMe]);

  const isPending = pendingIntent !== null;
  const feedback = message ?? auth.error;

  const runIntent = async (intent: AuthIntent, action: () => Promise<void>) => {
    try {
      setPendingIntent(intent);
      setMessage(null);
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setPendingIntent(null);
    }
  };

  return (
    <ScreenShell
      eyebrow="Authentication"
      title="Sign in"
      description="Sign in with email, Google, or GitHub."
    >
      <div className="min-w-0 space-y-4">
        <div className="grid gap-3">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="h-11 w-full border border-border bg-background px-3 text-sm text-foreground outline-hidden placeholder:text-muted-foreground/70 focus:border-border"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="h-11 w-full border border-border bg-background px-3 text-sm text-foreground outline-hidden placeholder:text-muted-foreground/70 focus:border-border"
            />
          </label>
        </div>

        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            className="h-4 w-4 border-border bg-transparent"
          />
          Remember me on this browser
        </label>

        <div className="grid gap-2">
          <Button
            type="button"
            className="h-11 w-full"
            disabled={isPending || !email || !password}
            onClick={() =>
              void runIntent("sign-in", async () => {
                await signInWithPassword({ email, password, rememberMe });
              })
            }
          >
            {pendingIntent === "sign-in" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Cloud className="h-4 w-4" />
            )}
            Sign in
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full border-border bg-transparent"
            disabled={isPending || !email || !password}
            onClick={() =>
              void runIntent("sign-up", async () => {
                await signUpWithPassword({ email, password, rememberMe });
              })
            }
          >
            {pendingIntent === "sign-up" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <UserRound className="h-4 w-4" />
            )}
            Create account
          </Button>
        </div>

                <div className="grid gap-2">
                  <OAuthButton
                    label="Continue with Google"
                    icon={<Cloud className="h-4 w-4" />}
                    loading={pendingIntent === "google"}
                    disabled={isPending}
                    onClick={() =>
                      void runIntent("google", async () => {
                        await signInWithOAuth("google", { rememberMe });
                      })
                    }
                  />
                  <OAuthButton
                    label="Continue with GitHub"
                    icon={<Github className="h-4 w-4" />}
                    loading={pendingIntent === "github"}
                    disabled={isPending}
                    onClick={() =>
                      void runIntent("github", async () => {
                        await signInWithOAuth("github", { rememberMe });
                      })
                    }
                  />
                </div>

        <Button
          type="button"
          variant="outline"
          className="h-11 w-full border-border bg-transparent"
          disabled={isPending}
          onClick={() =>
            void runIntent("privacy", async () => {
              await setPrivacyMode();
            })
          }
        >
          {pendingIntent === "privacy" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <UserRound className="h-4 w-4" />
          )}
          Continue in privacy mode
        </Button>

        {feedback && (
          <div className="border border-border bg-background px-4 py-3 text-sm text-foreground/88">
            {feedback}
          </div>
        )}
      </div>
    </ScreenShell>
  );
}

export function AppAuthGate({ children }: Props) {
  const auth = useAuthSnapshot();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    void initializeAuth();
  }, []);

  if (!isMounted) {
    return null;
  }

  if (!auth.isReady) {
    return <LoadingScreen />;
  }

  if (auth.mode === "privacy" && !auth.user) {
    return <>{children}</>;
  }

  if (!auth.isSupabaseConfigured) {
    return <UnconfiguredScreen />;
  }

  if (!auth.user) {
    return <SignInScreen />;
  }

  return <>{children}</>;
}
