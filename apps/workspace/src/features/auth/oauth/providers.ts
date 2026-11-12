import type { OAuthProvider } from "@remcostoeten/auth-drawer";

const SUPPORTED_PROVIDERS: readonly OAuthProvider[] = ["github", "google"];

type HealthBody = { authProviders?: string[] };

const known = new Map<string, Promise<OAuthProvider[]>>();

/**
 * @name parseCloudProviders
 * @description Keeps the providers a cloud deployment advertises that this
 * client has a button and a flow for, in the order the client lists them.
 *
 * @example
 * parseCloudProviders({ authProviders: ["google", "gitlab"] }); // ["google"]
 */
export function parseCloudProviders(body: HealthBody): OAuthProvider[] {
  const advertised = Array.isArray(body.authProviders) ? body.authProviders : [];
  return SUPPORTED_PROVIDERS.filter((provider) => advertised.includes(provider));
}

async function requestProviders(baseUrl: string): Promise<OAuthProvider[]> {
  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok) throw new Error(`cloud health returned ${response.status}`);
  const body: HealthBody = await response.json();
  return parseCloudProviders(body);
}

/**
 * @name loadCloudProviders
 * @description Asks the cloud deployment which OAuth providers it has
 * credentials for. A successful answer is kept for the session; a failure is
 * not, so the next open of the sign-in drawer asks again.
 *
 * @example
 * const providers = await loadCloudProviders("https://cloud.example");
 */
export function loadCloudProviders(baseUrl: string): Promise<OAuthProvider[]> {
  const cached = known.get(baseUrl);
  if (cached) return cached;
  const pending = requestProviders(baseUrl);
  known.set(baseUrl, pending);
  pending.catch(() => known.delete(baseUrl));
  return pending;
}
