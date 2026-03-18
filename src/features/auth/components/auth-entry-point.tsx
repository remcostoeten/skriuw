"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Cloud, Github, LoaderCircle, LogIn, Shield, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/button-component";
import { cn } from "@/shared/lib/utils";
import {
  initializeAuth,
  setPrivacyMode,
  signInWithOAuth,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from "@/modules/auth";
import { useAuthSnapshot } from "@/modules/auth/use-auth";

type Props = {
  className?: string;
};

type AuthIntent = "sign-in" | "sign-up" | "google" | "github" | "privacy" | "sign-out";

function resolveButtonCopy(auth: ReturnType<typeof useAuthSnapshot>) {
  if (auth.status === "authenticated") {
    return {
      icon: Cloud,
      label: "Synced",
      detail: auth.user?.name ?? "Account",
    };
  }

  if (auth.mode === "privacy") {
    return {
      icon: Shield,
      label: "Private",
      detail: "Local only",
    };
  }

  return {
    icon: LogIn,
    label: "Sign in",
    detail: "Backup + sync",
  };
}

export function AuthEntryPoint({ className }: Props) {
  const auth = useAuthSnapshot();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<AuthIntent | null>(null);

  const buttonCopy = useMemo(() => resolveButtonCopy(auth), [auth]);
  const ButtonIcon = buttonCopy.icon;

  useEffect(() => {
    void initializeAuth();
  }, []);

  useEffect(() => {
    setRememberMe(auth.rememberMe);
  }, [auth.rememberMe]);

  useEffect(() => {
    if (!open) {
      setMessage(null);
      setPassword("");
    }
  }, [open]);

  const isPending = pendingIntent !== null;

  const runIntent = async (intent: AuthIntent, action: () => Promise<void>) => {
    try {
      setPendingIntent(intent);
      setMessage(null);
      await action();
      if (intent !== "google" && intent !== "github") {
        setOpen(false);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setPendingIntent(null);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "pressable native-surface flex items-center gap-2 rounded-full border border-border/70 px-3 py-2 text-left shadow-[0_12px_40px_rgba(0,0,0,0.24)]",
            "text-foreground/92 hover:border-border hover:text-foreground",
            className,
          )}
          aria-label={buttonCopy.label}
        >
          <ButtonIcon className="h-4 w-4 text-foreground/78" strokeWidth={1.7} />
          <span className="flex flex-col leading-none">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
              {buttonCopy.label}
            </span>
            <span className="text-[11px] text-muted-foreground">{buttonCopy.detail}</span>
          </span>
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "bg-[linear-gradient(180deg,hsl(var(--background)/0)_0%,hsl(var(--background)/0.15)_48%,hsl(var(--background)/0.68)_75%,hsl(var(--background)/0.94)_100%)] backdrop-blur-[3px]",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "native-panel fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88dvh] w-full max-w-2xl overflow-hidden rounded-t-[2rem] border border-b-0 border-border/70",
            "p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] outline-hidden duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:slide-out-to-bottom-8 data-[state=open]:slide-in-from-bottom-8 motion-reduce:duration-150",
          )}
        >
          <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-white/16" />

          <div className="space-y-5 overflow-y-auto px-1 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <div className="space-y-2 pr-10">
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-foreground">
                Keep this workspace local, or sync it to your account
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="max-w-xl text-sm text-muted-foreground">
                Privacy mode stays local-first and fastest. Signing in adds best-effort backup and
                cross-device sync without changing how edits save locally.
              </DialogPrimitive.Description>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="native-surface rounded-[1.5rem] border border-border/65 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Shield className="h-4 w-4 text-foreground/70" strokeWidth={1.6} />
                  Privacy mode
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Local writes only. In private browsing, the browser may clear notes when the
                  session ends.
                </p>
              </div>
              <div className="native-surface rounded-[1.5rem] border border-border/65 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Cloud className="h-4 w-4 text-foreground/70" strokeWidth={1.6} />
                  Signed-in mode
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Local writes still land first. Remote sync runs in the background for backup and
                  multi-device continuity.
                </p>
              </div>
            </div>

            {!auth.isSupabaseConfigured && (
              <div className="rounded-[1.25rem] border border-amber-400/30 bg-amber-400/8 px-4 py-3 text-sm text-amber-100/85">
                Cloud auth is disabled until `NEXT_PUBLIC_SUPABASE_URL` and
                `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.
              </div>
            )}

            {auth.user ? (
              <div className="space-y-4">
                <div className="native-surface rounded-[1.5rem] border border-border/65 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Signed in as {auth.user.name}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{auth.user.email}</p>
                    </div>
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/90">
                      Sync on
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 flex-1 rounded-xl border-border/70 bg-transparent"
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
                      <Shield className="h-4 w-4" />
                    )}
                    Use privacy mode
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    className="h-11 flex-1 rounded-xl"
                    disabled={isPending}
                    onClick={() =>
                      void runIntent("sign-out", async () => {
                        await signOut();
                      })
                    }
                  >
                    {pendingIntent === "sign-out" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserRound className="h-4 w-4" />
                    )}
                    Sign out
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Email
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="native-surface h-11 w-full rounded-xl border border-border/70 px-3 text-sm text-foreground outline-hidden placeholder:text-muted-foreground/70 focus:border-border"
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
                      className="native-surface h-11 w-full rounded-xl border border-border/70 px-3 text-sm text-foreground outline-hidden placeholder:text-muted-foreground/70 focus:border-border"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="h-4 w-4 rounded border-border bg-transparent"
                  />
                  Remember me on this browser
                </label>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    className="h-11 rounded-xl"
                    disabled={isPending || !auth.isSupabaseConfigured || !email || !password}
                    onClick={() =>
                      void runIntent("sign-in", async () => {
                        await signInWithPassword({ email, password, rememberMe });
                      })
                    }
                  >
                    {pendingIntent === "sign-in" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogIn className="h-4 w-4" />
                    )}
                    Sign in
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl border-border/70 bg-transparent"
                    disabled={isPending || !auth.isSupabaseConfigured || !email || !password}
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

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl border-border/70 bg-transparent"
                    disabled={isPending || !auth.isSupabaseConfigured}
                    onClick={() =>
                      void runIntent("google", async () => {
                        await signInWithOAuth("google", { rememberMe });
                      })
                    }
                  >
                    {pendingIntent === "google" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Cloud className="h-4 w-4" />
                    )}
                    Continue with Google
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl border-border/70 bg-transparent"
                    disabled={isPending || !auth.isSupabaseConfigured}
                    onClick={() =>
                      void runIntent("github", async () => {
                        await signInWithOAuth("github", { rememberMe });
                      })
                    }
                  >
                    {pendingIntent === "github" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Github className="h-4 w-4" />
                    )}
                    Continue with GitHub
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full rounded-xl text-muted-foreground hover:text-foreground"
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
                    <Shield className="h-4 w-4" />
                  )}
                  Continue in privacy mode
                </Button>

                <p className="text-xs text-muted-foreground">
                  This build skips email verification. If sign-up returns no session, disable email
                  confirmation in Supabase Auth settings.
                </p>
              </div>
            )}

            {message && (
              <div className="rounded-[1.25rem] border border-border/65 bg-accent/35 px-4 py-3 text-sm text-foreground/88">
                {message}
              </div>
            )}
          </div>

          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full border border-border/65 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            Close
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
