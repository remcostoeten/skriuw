import type { OAuthProvider } from "@remcostoeten/auth-drawer";
import { OAUTH_TIMEOUT_MS, oauthFailure, type OAuthOutcome } from "./outcome";

const POPUP_MESSAGE_TYPE = "better-auth:oauth-popup";
const POPUP_NAME = "skriuw-oauth";
const CLOSED_POLL_MS = 500;
const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 640;

type PopupMessage = {
  type?: string;
  nonce?: string;
  token?: string;
  error?: { code?: string; description?: string };
};

let activePopup: Window | null = null;

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function popupFeatures(): string {
  const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
  const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;
  return `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},menubar=no,toolbar=no`;
}

/**
 * @name popupStartUrl
 * @description Address the sign-in popup opens. The cloud service validates
 * the opener origin against its trusted origins before it redirects to the
 * provider.
 *
 * @example
 * popupStartUrl("https://cloud.example", "github", "https://skriuw.com", "n1");
 */
export function popupStartUrl(
  baseUrl: string,
  provider: OAuthProvider,
  openerOrigin: string,
  nonce: string,
): string {
  const url = new URL(`${baseUrl}/api/auth/oauth-popup/start`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("popupOrigin", openerOrigin);
  url.searchParams.set("popupNonce", nonce);
  return url.toString();
}

function waitForPopup(popup: Window, authOrigin: string, nonce: string): Promise<OAuthOutcome> {
  return new Promise((resolve) => {
    function settle(outcome: OAuthOutcome) {
      window.removeEventListener("message", onMessage);
      clearInterval(closedPoll);
      clearTimeout(timeout);
      if (!popup.closed) popup.close();
      activePopup = null;
      resolve(outcome);
    }

    function onMessage(event: MessageEvent<PopupMessage>) {
      if (event.origin !== authOrigin) return;
      const message = event.data;
      if (message?.type !== POPUP_MESSAGE_TYPE || message.nonce !== nonce) return;
      if (message.error) {
        settle(
          oauthFailure(
            "provider_unavailable",
            message.error.description ?? "The provider refused the sign-in.",
          ),
        );
        return;
      }
      if (typeof message.token !== "string" || message.token === "") return;
      settle({ success: true, token: message.token });
    }

    const closedPoll = setInterval(() => {
      if (popup.closed) settle(oauthFailure("oauth_cancelled", "Sign-in was cancelled."));
    }, CLOSED_POLL_MS);
    const timeout = setTimeout(
      () => settle(oauthFailure("oauth_cancelled", "Sign-in timed out.")),
      OAUTH_TIMEOUT_MS,
    );
    window.addEventListener("message", onMessage);
  });
}

/**
 * @name signInWithPopup
 * @description Runs the provider sign-in in a popup on the cloud origin and
 * resolves with the bearer token the completion page posts back. Browser
 * builds use this because the app and the cloud service are separate origins.
 *
 * @example
 * const outcome = await signInWithPopup("https://cloud.example", "github");
 */
export function signInWithPopup(baseUrl: string, provider: OAuthProvider): Promise<OAuthOutcome> {
  if (activePopup && !activePopup.closed) {
    activePopup.focus();
    return Promise.resolve(oauthFailure("oauth_cancelled", "A sign-in window is already open."));
  }
  const nonce = randomNonce();
  const popup = window.open(
    popupStartUrl(baseUrl, provider, window.location.origin, nonce),
    POPUP_NAME,
    popupFeatures(),
  );
  if (!popup) {
    return Promise.resolve(
      oauthFailure(
        "popup_blocked",
        "The browser blocked the sign-in window. Allow pop-ups and retry.",
      ),
    );
  }
  activePopup = popup;
  return waitForPopup(popup, new URL(baseUrl).origin, nonce);
}
