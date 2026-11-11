import type { OAuthProvider } from "@remcostoeten/auth-drawer";
import { openExternalUrl } from "@/platform/runtime/external-links";
import { OAUTH_TIMEOUT_MS, oauthFailure, type OAuthOutcome } from "./outcome";

const CALLBACK_HOST = "auth";
const CALLBACK_PATH = "/callback";
const CALLBACK_PROTOCOL = "skriuw:";

export type DesktopCallback = { kind: "token"; token: string } | { kind: "error"; code: string };

let cancelPending: (() => void) | null = null;

function newState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * @name desktopStartUrl
 * @description Address the system browser opens to begin a provider sign-in
 * for the desktop app. The state is bound to this attempt and must come back
 * unchanged in the deep link.
 *
 * @example
 * desktopStartUrl("https://cloud.example", "github", "s".repeat(43));
 */
export function desktopStartUrl(baseUrl: string, provider: OAuthProvider, state: string): string {
  const url = new URL(`${baseUrl}/v1/auth/desktop/start`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * @name parseDesktopCallback
 * @description Reads a `skriuw://auth/callback` deep link. Anything that is
 * not that address, or that carries a state other than the one this attempt
 * generated, is ignored so a crafted link cannot sign the app in to someone
 * else's account.
 *
 * @example
 * parseDesktopCallback("skriuw://auth/callback?state=abc&token=t", "abc");
 */
export function parseDesktopCallback(raw: string, expectedState: string): DesktopCallback | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    url.protocol !== CALLBACK_PROTOCOL ||
    url.hostname !== CALLBACK_HOST ||
    url.pathname !== CALLBACK_PATH ||
    url.searchParams.get("state") !== expectedState
  ) {
    return null;
  }
  const error = url.searchParams.get("error");
  if (error) return { kind: "error", code: error };
  const token = url.searchParams.get("token");
  return token ? { kind: "token", token } : null;
}

async function exchangeOneTimeToken(baseUrl: string, token: string): Promise<OAuthOutcome> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/auth/one-time-token/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch (error) {
    console.error("one-time token exchange failed", error);
    return oauthFailure("network_error", "Could not reach the cloud service to finish signing in.");
  }
  const bearer = response.headers.get("set-auth-token");
  if (!response.ok || !bearer) {
    return oauthFailure("server_error", "The sign-in link has expired. Try again.");
  }
  return { success: true, token: bearer };
}

/**
 * @name signInWithSystemBrowser
 * @description Signs in through the user's default browser and resolves when
 * the `skriuw://` deep link returns. The one-time token in that link is
 * exchanged for a bearer token. A second call cancels the first.
 *
 * @example
 * const outcome = await signInWithSystemBrowser("https://cloud.example", "github");
 */
export async function signInWithSystemBrowser(
  baseUrl: string,
  provider: OAuthProvider,
): Promise<OAuthOutcome> {
  cancelPending?.();
  const state = newState();
  const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");

  return new Promise<OAuthOutcome>((resolve) => {
    let unlisten: (() => void) | null = null;
    let settled = false;

    function settle(outcome: OAuthOutcome) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unlisten?.();
      if (cancelPending === cancel) cancelPending = null;
      resolve(outcome);
    }

    function cancel() {
      settle(oauthFailure("oauth_cancelled", "Sign-in was cancelled."));
    }

    const timeout = setTimeout(
      () => settle(oauthFailure("oauth_cancelled", "Sign-in timed out.")),
      OAUTH_TIMEOUT_MS,
    );
    cancelPending = cancel;

    onOpenUrl((urls) => {
      for (const raw of urls) {
        const callback = parseDesktopCallback(raw, state);
        if (!callback) continue;
        if (callback.kind === "error") {
          settle(oauthFailure("provider_unavailable", "The provider refused the sign-in."));
          return;
        }
        void exchangeOneTimeToken(baseUrl, callback.token).then(settle);
        return;
      }
    })
      .then((stop) => {
        if (settled) {
          stop();
          return;
        }
        unlisten = stop;
        return openExternalUrl(desktopStartUrl(baseUrl, provider, state));
      })
      .catch((error) => {
        console.error("desktop sign-in could not start", error);
        settle(oauthFailure("provider_unavailable", "Could not open the browser to sign in."));
      });
  });
}
