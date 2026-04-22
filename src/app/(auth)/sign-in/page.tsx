"use client";

import { Check, Cloud, Eye, EyeOff, Github, LogIn } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button-component";
import { cn } from "@/shared/lib/utils";
import { EmailDomainAutocomplete } from "../email-domain-autocomplete";
import { AuthErrorAlert, resolveAuthError, type AuthErrorNotice } from "../auth-errors";
import {
  initializeAuth,
  setRememberMe as saveRememberMePreference,
  signInWithOAuth,
  signInWithPassword,
} from "@/platform/auth";

type AuthIntent = "sign-in" | "google" | "github";
type AuthActionState = "idle" | "pending" | "success";

const SUCCESS_PAUSE_MS = 260;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [authError, setAuthError] = useState<AuthErrorNotice | null>(null);
  const [pendingIntent, setPendingIntent] = useState<AuthIntent | null>(null);
  const [completedIntent, setCompletedIntent] = useState<AuthIntent | null>(null);

  useEffect(() => {
    void initializeAuth().then((snapshot) => {
      setRememberMe(snapshot.rememberMe);
    });
  }, []);

  useEffect(() => {
    const callbackError = new URLSearchParams(window.location.search).get("error");
    if (callbackError) {
      setAuthError(resolveAuthError(new Error(callbackError)));
    }
  }, []);

  const isPending = pendingIntent !== null;
  const isBusy = isPending || completedIntent !== null;

  const getActionState = (intent: AuthIntent): AuthActionState => {
    if (completedIntent === intent) {
      return "success";
    }

    if (pendingIntent === intent) {
      return "pending";
    }

    return "idle";
  };

  const runIntent = async (intent: AuthIntent, action: () => Promise<void>) => {
    try {
      setPendingIntent(intent);
      setCompletedIntent(null);
      setAuthError(null);
      await action();
      setPendingIntent(null);
      setCompletedIntent(intent);
      if (intent === "sign-in") {
        await wait(SUCCESS_PAUSE_MS);
        router.replace("/app");
        router.refresh();
      }
    } catch (error) {
      setAuthError(resolveAuthError(error));
      setPendingIntent(null);
      setCompletedIntent(null);
    }
  };

  const handlePasswordSignIn = () => {
    void runIntent("sign-in", async () => {
      await signInWithPassword({ email: email.trim(), password, rememberMe });
    });
  };

  const handleRememberMeChange = (checked: boolean) => {
    setRememberMe(checked);
    void saveRememberMePreference(checked);
  };

  const LoadingDots = () => (
    <span className="auth-loading-dots" aria-hidden="true">
      <span className="auth-loading-dot" />
      <span className="auth-loading-dot" />
      <span className="auth-loading-dot" />
    </span>
  );

  return (
    <>
      <div className="mb-8 space-y-1 px-6 text-left">
        <h1 className="text-2xl font-medium text-foreground">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to your account to continue your journey with Skriuw
        </p>
      </div>
      <div className="relative px-6">
        <div className="space-y-6">
          <div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              data-state={getActionState("google")}
              aria-busy={pendingIntent === "google"}
              className="auth-action-button h-12 w-full justify-start rounded-none border border-border bg-transparent px-4"
              disabled={isBusy}
              onClick={() =>
                void runIntent("google", async () => {
                  await signInWithOAuth("google", { rememberMe });
                })
              }
            >
              <span className="auth-action-icon">
                {completedIntent === "google" ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : pendingIntent === "google" ? (
                  <LoadingDots />
                ) : (
                  <Cloud className="size-4" aria-hidden="true" />
                )}
              </span>
              <span className="auth-action-label">
                {completedIntent === "google"
                  ? "Redirecting..."
                  : pendingIntent === "google"
                    ? "Opening Google..."
                    : "Sign in with Google"}
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              data-state={getActionState("github")}
              aria-busy={pendingIntent === "github"}
              className="auth-action-button h-12 w-full justify-start rounded-none border border-border bg-transparent px-4"
              disabled={isBusy}
              onClick={() =>
                void runIntent("github", async () => {
                  await signInWithOAuth("github", { rememberMe });
                })
              }
            >
              <span className="auth-action-icon">
                {completedIntent === "github" ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : pendingIntent === "github" ? (
                  <LoadingDots />
                ) : (
                  <Github className="size-4" aria-hidden="true" />
                )}
              </span>
              <span className="auth-action-label">
                {completedIntent === "github"
                  ? "Redirecting..."
                  : pendingIntent === "github"
                    ? "Opening GitHub..."
                    : "Sign in with GitHub"}
              </span>
            </Button>
          </div>

          <div className="relative flex w-full items-center justify-center gap-3">
            <div className="h-px flex-1 bg-border opacity-70" />
            <span className="text-nowrap text-sm font-medium text-muted-foreground/50">Or</span>
            <div className="h-px flex-1 bg-border opacity-70" />
          </div>

          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              handlePasswordSignIn();
            }}
          >
            <div className="space-y-3">
              <label className="font-medium text-foreground" htmlFor="email">
                Email<span className="text-primary">*</span>
              </label>
              <EmailDomainAutocomplete
                id="email"
                value={email}
                onValueChange={setEmail}
                placeholder="Enter your email"
                required
                className={cn(
                  "auth-input h-12 w-full rounded-none border border-border bg-background px-4 text-sm text-foreground outline-hidden",
                  "placeholder:text-muted-foreground/70 focus:border-muted-foreground/50",
                )}
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-medium text-foreground" htmlFor="password">
                  Password<span className="text-primary">*</span>
                </label>
              </div>
              <div className="relative">
                <input
                  autoComplete="current-password"
                  id="password"
                  type={isPasswordVisible ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                  className={cn(
                    "auth-input h-12 w-full rounded-none border border-border bg-background px-4 pr-12 text-sm text-foreground outline-hidden",
                    "placeholder:text-muted-foreground/70 focus:border-muted-foreground/50",
                  )}
                />
                <button
                  type="button"
                  aria-controls="password"
                  aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                  aria-pressed={isPasswordVisible}
                  className="auth-password-toggle absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/70"
                  onClick={() => setIsPasswordVisible((visible) => !visible)}
                >
                  {isPasswordVisible ? (
                    <EyeOff className="auth-password-toggle-icon size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="auth-password-toggle-icon size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <label
              htmlFor="remember-me"
              className="flex cursor-pointer items-center gap-3 text-sm text-muted-foreground"
            >
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => handleRememberMeChange(event.target.checked)}
                className="auth-check-input sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "auth-check-control flex size-4 shrink-0 items-center justify-center border border-border bg-background",
                  rememberMe && "border-foreground bg-foreground",
                )}
              >
                <Check
                  className={cn(
                    "auth-check-mark size-3.5",
                    rememberMe ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-75 translate-y-px",
                  )}
                  strokeWidth={3}
                />
              </span>
              <span>Remember me on this device</span>
            </label>

            <Button
              type="submit"
              data-state={getActionState("sign-in")}
              aria-busy={pendingIntent === "sign-in"}
              className="auth-action-button h-12 w-full rounded-none"
              disabled={isBusy || !email || !password}
            >
              <span className="auth-action-icon">
                {completedIntent === "sign-in" ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : pendingIntent === "sign-in" ? (
                  <LoadingDots />
                ) : (
                  <LogIn className="size-4" aria-hidden="true" />
                )}
              </span>
              <span className="auth-action-label">
                {completedIntent === "sign-in"
                  ? "Signed in"
                  : pendingIntent === "sign-in"
                    ? "Signing in..."
                    : "Sign in"}
              </span>
            </Button>
          </form>
        </div>
      </div>

      <div className="mt-5 flex flex-col flex-wrap items-center justify-center gap-4 px-5 text-center lg:flex-row">
        <p className="flex-1 text-[13px] text-muted-foreground lg:text-nowrap">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            className="font-medium text-foreground duration-200 hover:text-foreground/80"
            onClick={() => router.push("/sign-up")}
          >
            Sign up
          </button>
        </p>
      </div>

      {authError ? <AuthErrorAlert error={authError} /> : null}
    </>
  );
}
