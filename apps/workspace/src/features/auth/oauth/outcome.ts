import type { AuthResult, OAuthProvider } from "@remcostoeten/auth-drawer";

export type OAuthFailureCode =
  | "oauth_cancelled"
  | "popup_blocked"
  | "provider_unavailable"
  | "network_error"
  | "server_error";

export type OAuthFailure = { success: false; code: OAuthFailureCode; message: string };

export type OAuthOutcome = { success: true; token: string } | OAuthFailure;

export const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

export function oauthFailure(code: OAuthFailureCode, message: string): OAuthFailure {
  return { success: false, code, message };
}

/**
 * @name oauthFailureResult
 * @description Maps a failed OAuth outcome onto the result shape the sign-in
 * drawer renders under the provider buttons.
 *
 * @example
 * return oauthFailureResult(outcome, "github");
 */
export function oauthFailureResult(outcome: OAuthFailure, provider?: OAuthProvider): AuthResult {
  return {
    success: false,
    error: {
      code: outcome.code,
      message: outcome.message,
      target: "oauth",
      provider,
      retryable: true,
    },
  };
}
