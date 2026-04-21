"use client";

import { Check, Cloud, Eye, EyeOff, Github, UserRound } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button-component";
import { cn } from "@/shared/lib/utils";
import { EmailDomainAutocomplete } from "../email-domain-autocomplete";
import {
  AuthErrorAlert,
  createAuthValidationError,
  resolveAuthError,
  type AuthErrorNotice,
} from "../auth-errors";
import {
  initializeAuth,
  setRememberMe as saveRememberMePreference,
  signInWithOAuth,
  signUpWithPassword,
} from "@/platform/auth";

type AuthIntent = "sign-up" | "google" | "github";
type AuthActionState = "idle" | "pending" | "success";

const SUCCESS_PAUSE_MS = 260;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

  const isPending = pendingIntent !== null;
  const isBusy = isPending || completedIntent !== null;
  const hasMinimumPasswordLength = password.length >= 8;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    hasMinimumPasswordLength &&
    passwordsMatch &&
    !isBusy;

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
      if (intent === "sign-up") {
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

  const handlePasswordSignUp = () => {
    if (!name.trim()) {
      setAuthError(createAuthValidationError("Enter your name to create an account."));
      return;
    }

    if (!hasMinimumPasswordLength) {
      setAuthError(createAuthValidationError("Password must be at least 8 characters."));
      return;
    }

    if (!passwordsMatch) {
      setAuthError(createAuthValidationError("Passwords do not match."));
      return;
    }

    void runIntent("sign-up", async () => {
      await signUpWithPassword({
        email: email.trim(),
        password,
        rememberMe,
        name: name.trim(),
      });
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
      <div className="mb-6 space-y-1 px-6 text-left">
        <h1 className="text-2xl font-medium text-foreground">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Sign up to start syncing your notes and journal
        </p>
      </div>
      <div className="relative px-6">
        <div className="space-y-5">
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
                    : "Sign up with Google"}
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
                    : "Sign up with GitHub"}
              </span>
            </Button>
          </div>

          <div className="relative flex w-full items-center justify-center gap-3">
            <div className="h-px flex-1 bg-border opacity-70" />
            <span className="text-nowrap text-sm font-medium text-muted-foreground/50">Or</span>
            <div className="h-px flex-1 bg-border opacity-70" />
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              handlePasswordSignUp();
            }}
          >
            <div className="space-y-2">
              <label className="font-medium text-foreground" htmlFor="name">
                Name<span className="text-primary">*</span>
              </label>
              <input
                autoComplete="name"
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your name"
                required
                className={cn(
                  "auth-input h-12 w-full rounded-none border border-border bg-background px-4 text-sm text-foreground outline-hidden",
                  "placeholder:text-muted-foreground/70 focus:border-muted-foreground/50",
                )}
              />
            </div>
            <div className="space-y-2">
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-medium text-foreground" htmlFor="password">
                  Password<span className="text-primary">*</span>
                </label>
              </div>
              <div className="relative">
                <input
                  autoComplete="new-password"
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
                  aria-controls="password confirm-password"
                  aria-label={isPasswordVisible ? "Hide passwords" : "Show passwords"}
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
              {password.length > 0 && !hasMinimumPasswordLength ? (
                <p className="text-xs text-muted-foreground">Use at least 8 characters.</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-medium text-foreground" htmlFor="confirm-password">
                  Confirm password<span className="text-primary">*</span>
                </label>
              </div>
              <input
                autoComplete="new-password"
                id="confirm-password"
                type={isPasswordVisible ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="••••••••"
                required
                className={cn(
                  "auth-input h-12 w-full rounded-none border border-border bg-background px-4 text-sm text-foreground outline-hidden",
                  "placeholder:text-muted-foreground/70 focus:border-muted-foreground/50",
                  confirmPassword.length > 0 &&
                    !passwordsMatch &&
                    "border-destructive/70 focus:border-destructive/70",
                )}
              />
              {confirmPassword.length > 0 && !passwordsMatch ? (
                <p className="text-xs text-destructive">Passwords do not match.</p>
              ) : null}
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
              data-state={getActionState("sign-up")}
              aria-busy={pendingIntent === "sign-up"}
              className="auth-action-button h-12 w-full rounded-none"
              disabled={!canSubmit}
            >
              <span className="auth-action-icon">
                {completedIntent === "sign-up" ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : pendingIntent === "sign-up" ? (
                  <LoadingDots />
                ) : (
                  <UserRound className="size-4" aria-hidden="true" />
                )}
              </span>
              <span className="auth-action-label">
                {completedIntent === "sign-up"
                  ? "Account created"
                  : pendingIntent === "sign-up"
                    ? "Creating account..."
                    : "Create account"}
              </span>
            </Button>
          </form>
        </div>
      </div>

      <div className="mt-4 flex flex-col flex-wrap items-center justify-center gap-4 px-5 text-center lg:flex-row">
        <p className="flex-1 text-[13px] text-muted-foreground lg:text-nowrap">
          Already have an account?{" "}
          <button
            type="button"
            className="font-medium text-foreground duration-200 hover:text-foreground/80"
            onClick={() => router.push("/sign-in")}
          >
            Sign in
          </button>
        </p>
      </div>

      {authError ? <AuthErrorAlert error={authError} /> : null}
    </>
  );
}
