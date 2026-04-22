"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import {
  ArrowLeft,
  Cloud,
  Github,
  LoaderCircle,
  LogIn,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/button-component";
import { DialogTitle } from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/utils";
import { RawLogo } from "@/shared/ui/logo";
import { getAvatarSeed } from "@/shared/lib/avatar";
import { AvatarFace } from "@/shared/ui/avatar-face";
import { usePreferencesStore } from "@/features/settings/store";
import {
  initializeAuth,
  signInWithOAuth,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from "@/platform/auth";
import { useAuthSnapshot } from "@/platform/auth/use-auth";

type Props = {
  className?: string;
  triggerVariant?: "default" | "rail-avatar";
  defaultOpen?: boolean;
  hideTrigger?: boolean;
  dismissible?: boolean;
};

type AuthIntent = "sign-in" | "sign-up" | "google" | "github" | "sign-out";

function resolveButtonCopy(auth: ReturnType<typeof useAuthSnapshot>) {
  if (auth.phase === "authenticated") {
    return {
      icon: Cloud,
      label: "Workspace",
      detail: auth.user?.name ?? "Signed in",
    };
  }

  return {
    icon: LogIn,
    label: "Sign in",
    detail: "Cloud workspace",
  };
}

export function AuthEntryPoint({
  className,
  triggerVariant = "default",
  defaultOpen = false,
  hideTrigger = false,
  dismissible = true,
}: Props) {
  const auth = useAuthSnapshot();
  const avatarColor = usePreferencesStore((state) => state.profile.avatarColor);
  const [isMounted, setIsMounted] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
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
  const avatarSeed = useMemo(
    () => getAvatarSeed(auth.user?.email || auth.user?.name || auth.user?.id, "workspace-user"),
    [auth],
  );

  if (!isMounted) {
    return null;
  }

  const runIntent = async (intent: AuthIntent, action: () => Promise<void>) => {
    try {
      setPendingIntent(intent);
      setMessage(null);
      await action();
      if (dismissible && intent !== "google" && intent !== "github") {
        setOpen(false);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setPendingIntent(null);
    }
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (dismissible) {
          setOpen(nextOpen);
        }
      }}
    >
      {!hideTrigger ? (
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
              title={
                auth.user ? `Workspace: ${buttonCopy.detail}` : buttonCopy.label
              }
            >
              {auth.user ? (
                <AvatarFace
                  name={avatarSeed}
                  size={36}
                  color={avatarColor ?? undefined}
                  className="h-full w-full"
                />
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
      ) : null}

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/70 backdrop-blur-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-50 overflow-hidden bg-card outline-hidden",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        >
          <DialogTitle className="sr-only">
            Workspace authentication
          </DialogTitle>

          <div className="flex h-full flex-col md:flex-row">
            <div className="relative hidden w-full overflow-hidden border-r border-border bg-black p-12 md:flex md:w-1/2 md:flex-col md:justify-between">
              <div className="absolute inset-0">
              
              compoment</div>
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12)_0%,rgba(0,0,0,0.45)_100%)]" />

              {dismissible ? (
                <DialogPrimitive.Close asChild>
                  <Button
                    variant="ghost"
                    className="group relative z-10 h-auto w-fit gap-2 px-0 text-white/50 hover:bg-transparent hover:text-white/80"
                  >
                    <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
                    Back
                  </Button>
                </DialogPrimitive.Close>
              ) : (
                <div className="relative z-10 h-9" aria-hidden="true" />
              )}

              <div className="relative z-10">
                <h1 className="mb-2 w-full max-w-sm font-serif text-4xl font-medium leading-[46px] text-white/60">
                  Keep your{" "}
                  <span className="text-white">notes and journal</span> in sync
                  with <span className="font-serif">Skriuw</span>
                </h1>
                <p className="max-w-sm text-white/90">
                  Continue writing on web, review your journal over time, and
                  carry the same workspace across every device you use.
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col overflow-auto bg-background md:w-1/2">
              <div className="flex justify-center p-6 pt-8 md:p-8 md:pt-20">
                <RawLogo
                  variant="sidebar"
                  size={40}
                  className="text-foreground"
                />
              </div>

              <div className="flex flex-1 items-center justify-center md:p-8 md:pt-0">
                <div className="w-full max-w-md">
                  {auth.user ? (
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          Workspace access
                        </p>
                        <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                          You&apos;re signed in.
                        </h2>
                        <p className="text-sm leading-6 text-muted-foreground">
                          Your cloud workspace is active and ready to sync
                          across notes and journal.
                        </p>
                      </div>

                      <div className="space-y-4 border border-border bg-card p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {auth.user.name}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {auth.user.email}
                            </p>
                          </div>
                          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Cloud
                          </span>
                        </div>

                        <div className="rounded-none border border-border bg-background px-4 py-3">
                          <div className="flex items-start gap-3">
                            <ShieldCheck className="mt-0.5 h-4 w-4 text-foreground/70" />
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                Account session active
                              </p>
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                Continue into your workspace or sign out from
                                this browser.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-12 rounded-none border border-border bg-transparent"
                            onClick={() => {
                              setOpen(false);
                            }}
                          >
                            Close
                          </Button>
                          <Button
                            type="button"
                            variant="default"
                            className="h-12 rounded-none"
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
                    </div>
                  ) : (
                    <>
                      <div className="mb-8 space-y-1 px-6 text-left">
                        <h1 className="text-2xl font-medium text-foreground">
                          Create your account
                        </h1>
                        <p className="text-sm text-muted-foreground">
                          Sign up to start syncing your notes and journal
                        </p>
                      </div>
                      <div className="relative px-6">
                        <div className="space-y-6">
                          <div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-12 w-full justify-start rounded-none border border-border bg-transparent px-4"
                              disabled={isPending}
                              onClick={() =>
                                void runIntent("google", async () => {
                                  await signInWithOAuth("google", {
                                    rememberMe,
                                  });
                                })
                              }
                            >
                              <Cloud className="mr-2 h-4 w-4" />
                              Sign up with Google
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-12 w-full justify-start rounded-none border border-border bg-transparent px-4"
                              disabled={isPending}
                              onClick={() =>
                                void runIntent("github", async () => {
                                  await signInWithOAuth("github", {
                                    rememberMe,
                                  });
                                })
                              }
                            >
                              <Github className="mr-2 h-4 w-4" />
                              Sign up with GitHub
                            </Button>
                          </div>

                          <div className="relative flex w-full items-center justify-center gap-3">
                            <div className="h-px flex-1 bg-border opacity-70" />
                            <span className="text-nowrap text-sm font-medium text-muted-foreground/50">
                              Or
                            </span>
                            <div className="h-px flex-1 bg-border opacity-70" />
                          </div>

                          <form className="space-y-5">
                            <div className="space-y-3">
                              <label
                                className="font-medium text-foreground"
                                htmlFor="email"
                              >
                                Email<span className="text-primary">*</span>
                              </label>
                              <input
                                autoComplete="email"
                                id="email"
                                type="email"
                                value={email}
                                onChange={(event) =>
                                  setEmail(event.target.value)
                                }
                                placeholder="Enter your email"
                                required
                                className={cn(
                                  "h-12 w-full rounded-none border border-border bg-background px-4 text-sm text-foreground outline-hidden",
                                  "placeholder:text-muted-foreground/70 focus:border-muted-foreground/50",
                                )}
                              />
                            </div>
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <label
                                  className="font-medium text-foreground"
                                  htmlFor="password"
                                >
                                  Password
                                  <span className="text-primary">*</span>
                                </label>
                              </div>
                              <input
                                autoComplete="current-password"
                                id="password"
                                type="password"
                                value={password}
                                onChange={(event) =>
                                  setPassword(event.target.value)
                                }
                                placeholder="••••••••"
                                required
                                className={cn(
                                  "h-12 w-full rounded-none border border-border bg-background px-4 text-sm text-foreground outline-hidden",
                                  "placeholder:text-muted-foreground/70 focus:border-muted-foreground/50",
                                )}
                              />
                            </div>

                            <Button
                              type="submit"
                              className="h-12 w-full rounded-none"
                              disabled={isPending || !email || !password}
                              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                e.preventDefault();
                                void runIntent("sign-up", async () => {
                                  await signUpWithPassword({
                                    email,
                                    password,
                                    rememberMe,
                                  });
                                });
                              }}
                            >
                              {pendingIntent === "sign-up" ? (
                                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <UserRound className="mr-2 h-4 w-4" />
                              )}
                              {pendingIntent === "sign-up"
                                ? "Creating account..."
                                : "Create account"}
                            </Button>
                          </form>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col flex-wrap items-center justify-center gap-4 px-5 text-center lg:flex-row">
                        <p className="flex-1 text-[13px] text-muted-foreground lg:text-nowrap">
                          Already have an account?{" "}
                          <button
                            type="button"
                            className="font-medium text-foreground duration-200 hover:text-foreground/80"
                            onClick={() =>
                              void runIntent("sign-in", async () => {
                                await signInWithPassword({
                                  email,
                                  password,
                                  rememberMe,
                                });
                              })
                            }
                          >
                            Sign in
                          </button>
                        </p>
                      </div>
                    </>
                  )}

                  {message && (
                    <div className="mt-4 rounded-none border border-border bg-accent/35 px-4 py-3 text-sm text-foreground/88">
                      {message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
