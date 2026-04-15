"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { Cloud, Github, LoaderCircle, LogIn, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/button-component";
import { DialogTitle } from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/utils";
import {
  initializeAuth,
  setCloudMode,
  setGuestMode,
  signInWithOAuth,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from "@/platform/auth";
import { useAuthSnapshot } from "@/platform/auth/use-auth";

type Props = {
  className?: string;
  triggerVariant?: "default" | "rail-avatar";
};

type AuthIntent = "sign-in" | "sign-up" | "google" | "github" | "sign-out" | "guest" | "cloud";

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

function resolveButtonCopy(auth: ReturnType<typeof useAuthSnapshot>) {
  if (auth.phase === "authenticated") {
    return {
      icon: Cloud,
      label: "Workspace",
      detail: auth.user?.name ?? "Signed in",
    };
  }

  if (auth.workspaceMode === "guest") {
    return {
      icon: UserRound,
      label: "Guest",
      detail: "On-device workspace",
    };
  }

  return {
    icon: LogIn,
    label: "Sign in",
    detail: "Cloud workspace",
  };
}

function getAvatarLabel(auth: ReturnType<typeof useAuthSnapshot>) {
  const name = auth.user?.name?.trim();
  if (name) {
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");

    if (initials) return initials;
  }

  return "U";
}

export function AuthEntryPoint({ className, triggerVariant = "default" }: Props) {
  const auth = useAuthSnapshot();
  const [isMounted, setIsMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<AuthIntent | null>(null);

  const buttonCopy = useMemo(() => resolveButtonCopy(auth), [auth]);
  const ButtonIcon = buttonCopy.icon;

  useEffect(() => {
    setIsMounted(true);
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
  const avatarLabel = useMemo(() => getAvatarLabel(auth), [auth]);

  if (!isMounted) {
    return null;
  }

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
        {triggerVariant === "rail-avatar" ? (
          <button
            type="button"
            className={cn(
              "pressable group flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/78",
              "hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
              className,
            )}
            aria-label={buttonCopy.label}
            title={auth.user ? `Workspace: ${buttonCopy.detail}` : buttonCopy.label}
          >
            {auth.user ? (
              <span className="text-[11px] font-medium tracking-[0.08em]">{avatarLabel}</span>
            ) : (
              <UserRound className="h-4 w-4" strokeWidth={1.7} />
            )}
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "pressable group flex items-center gap-2 border border-border bg-background px-3 py-2 text-left",
              "text-foreground/90 hover:border-border hover:bg-accent/40 hover:text-foreground",
              className,
            )}
            aria-label={buttonCopy.label}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/72 transition-colors group-hover:text-foreground/88">
              <ButtonIcon className="h-4 w-4" strokeWidth={1.7} />
            </span>
            <span className="flex min-w-0 flex-col leading-none">
              <span className="block truncate text-[12px] font-medium tracking-[0.01em]">
                {buttonCopy.label}
              </span>
              <span className="block truncate pt-0.5 text-[11px] text-muted-foreground">
                {buttonCopy.detail}
              </span>
            </span>
          </button>
        )}
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "bg-black/55 backdrop-blur-[2px]",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[88dvh] w-[calc(100vw-1.5rem)] max-w-[26rem] -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-border bg-card",
            "p-6 outline-hidden duration-200 ease-out sm:p-7",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:duration-150",
          )}
        >
          <DialogTitle className="sr-only">Workspace</DialogTitle>
          <div className="min-w-0 space-y-5 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            {auth.user ? (
              <div className="min-w-0 space-y-4">
                <div className="border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Signed in as {auth.user.name}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{auth.user.email}</p>
                    </div>
                    <span className="border border-border bg-background px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Cloud
                    </span>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                  <Button
                    asChild
                    type="button"
                    variant="outline"
                    className="h-11 w-full border-border bg-transparent"
                  >
                    <Link href="/profile">View profile</Link>
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    className="h-11 w-full"
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
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full border-border bg-transparent"
                    disabled={isPending}
                    onClick={() =>
                      void runIntent("guest", async () => {
                        await setGuestMode();
                      })
                    }
                  >
                    {pendingIntent === "guest" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserRound className="h-4 w-4" />
                    )}
                    Use guest workspace
                  </Button>
                </div>
              </div>
            ) : (
              <div className="min-w-0 space-y-4">
                <div className="grid gap-2">
                  <Button
                    type="button"
                    variant={auth.workspaceMode === "cloud" ? "default" : "outline"}
                    className="h-11 w-full"
                    disabled={isPending || !auth.isSupabaseConfigured}
                    onClick={() =>
                      void runIntent("cloud", async () => {
                        await setCloudMode();
                      })
                    }
                  >
                    {pendingIntent === "cloud" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Cloud className="h-4 w-4" />
                    )}
                    Cloud workspace
                  </Button>
                  <Button
                    type="button"
                    variant={auth.workspaceMode === "guest" ? "default" : "outline"}
                    className="h-11 w-full border-border bg-transparent"
                    disabled={isPending}
                    onClick={() =>
                      void runIntent("guest", async () => {
                        await setGuestMode();
                      })
                    }
                  >
                    {pendingIntent === "guest" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserRound className="h-4 w-4" />
                    )}
                    Guest workspace
                  </Button>
                </div>

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

                <label className="flex items-center gap-3 border border-border px-3 py-2.5 text-sm text-muted-foreground">
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
                    className="h-11 w-full border-border bg-transparent"
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

                <div className="grid gap-2">
                  <OAuthButton
                    label="Continue with Google"
                    icon={<Cloud className="h-4 w-4" />}
                    loading={pendingIntent === "google"}
                    disabled={isPending || !auth.isSupabaseConfigured}
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
                    disabled={isPending || !auth.isSupabaseConfigured}
                    onClick={() =>
                      void runIntent("github", async () => {
                        await signInWithOAuth("github", { rememberMe });
                      })
                    }
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Guest workspace never touches Supabase. If sign-up returns no session, disable
                  email confirmation in Supabase Auth settings.
                </p>
              </div>
            )}

            {message && (
              <div className="border border-border bg-accent/35 px-4 py-3 text-sm text-foreground/88">
                {message}
              </div>
            )}
          </div>

          <DialogPrimitive.Close className="absolute right-4 top-4 border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            Close
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
