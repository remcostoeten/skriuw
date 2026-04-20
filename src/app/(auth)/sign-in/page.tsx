"use client";

import {
  Cloud,
  Github,
  LoaderCircle,
  LogIn,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button-component";
import { cn } from "@/shared/lib/utils";
import {
  initializeAuth,
  signInWithOAuth,
  signInWithPassword,
} from "@/platform/auth";

type AuthIntent = "sign-in" | "google" | "github";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<AuthIntent | null>(null);

  useEffect(() => {
    void initializeAuth();
  }, []);

  const isPending = pendingIntent !== null;

  const runIntent = async (intent: AuthIntent, action: () => Promise<void>) => {
    try {
      setPendingIntent(intent);
      setMessage(null);
      await action();
      if (intent === "sign-in") {
        router.replace("/app");
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
      setPendingIntent(null);
    }
  };

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
              className="h-12 w-full justify-start rounded-none border border-border bg-transparent px-4"
              disabled={isPending}
              onClick={() =>
                void runIntent("google", async () => {
                  await signInWithOAuth("google", { rememberMe: true });
                })
              }
            >
              {pendingIntent === "google" ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Cloud className="mr-2 h-4 w-4" />
              )}
              Sign in with Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-start rounded-none border border-border bg-transparent px-4"
              disabled={isPending}
              onClick={() =>
                void runIntent("github", async () => {
                  await signInWithOAuth("github", { rememberMe: true });
                })
              }
            >
              {pendingIntent === "github" ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Github className="mr-2 h-4 w-4" />
              )}
              Sign in with GitHub
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
              <label className="font-medium text-foreground" htmlFor="email">
                Email<span className="text-primary">*</span>
              </label>
              <input
                autoComplete="email"
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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
                <label className="font-medium text-foreground" htmlFor="password">
                  Password<span className="text-primary">*</span>
                </label>
              </div>
              <input
                autoComplete="current-password"
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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
              onClick={(e) => {
                e.preventDefault();
                void runIntent("sign-in", async () => {
                  await signInWithPassword({ email, password, rememberMe: true });
                });
              }}
            >
              {pendingIntent === "sign-in" ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              {pendingIntent === "sign-in" ? "Signing in..." : "Sign in"}
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

      {message && (
        <div className="mt-4 rounded-none border border-border bg-accent/35 px-4 py-3 text-sm text-foreground/88">
          {message}
        </div>
      )}
    </>
  );
}
