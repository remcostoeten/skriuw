import { AlertCircle, WifiOff } from "lucide-react";

type AuthErrorKind = "network" | "configuration" | "credentials" | "validation" | "unknown";

export type AuthErrorNotice = {
  kind: AuthErrorKind;
  title: string;
  message: string;
};

export function createAuthValidationError(message: string): AuthErrorNotice {
  return {
    kind: "validation",
    title: "Check your details",
    message,
  };
}

export function resolveAuthError(error: unknown): AuthErrorNotice {
  if (!(error instanceof Error)) {
    return fallbackAuthError();
  }

  const message = error.message.trim();
  const normalized = message.toLowerCase();

  if (
    normalized === "failed to fetch" ||
    normalized.includes("networkerror") ||
    normalized.includes("network request failed") ||
    normalized.includes("fetch failed")
  ) {
    return {
      kind: "network",
      title: "Connection problem",
      message: "We couldn't reach Skriuw. Check your connection and try again.",
    };
  }

  if (normalized.includes("supabase") && normalized.includes("configured")) {
    return {
      kind: "configuration",
      title: "Cloud auth is not configured",
      message: "Add the Supabase environment variables before signing in.",
    };
  }

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials")
  ) {
    return {
      kind: "credentials",
      title: "Sign-in failed",
      message: "The email or password does not match an account.",
    };
  }

  if (message) {
    return {
      kind: "unknown",
      title: "Authentication failed",
      message,
    };
  }

  return fallbackAuthError();
}

function fallbackAuthError(): AuthErrorNotice {
  return {
    kind: "unknown",
    title: "Authentication failed",
    message: "Something went wrong. Try again.",
  };
}

export function AuthErrorAlert({ error }: { error: AuthErrorNotice }) {
  const Icon = error.kind === "network" ? WifiOff : AlertCircle;

  return (
    <div
      role="alert"
      className="mt-4 flex gap-3 border border-destructive/25 bg-destructive/7 px-4 py-3 text-left"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-destructive/80" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium leading-5 text-foreground">{error.title}</p>
        <p className="text-sm leading-5 text-muted-foreground">{error.message}</p>
      </div>
    </div>
  );
}
