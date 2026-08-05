const CLOUD_HOST_SUFFIXES = [".skriuw.app", ".workers.dev"] as const;
const PRODUCTION_CLOUD_URL = "https://skriuw-v2-cloud.remcostoeten.workers.dev";

export type AuthConfiguration =
  | { available: true; baseUrl: string }
  | { available: false; reason: string };

export function resolveAuthConfiguration(raw: string | undefined, development: boolean): AuthConfiguration {
  const configured = raw?.trim();
  if (!configured) {
    if (development) return { available: true, baseUrl: "http://localhost:8787" };
    return { available: true, baseUrl: PRODUCTION_CLOUD_URL };
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return { available: false, reason: "The configured cloud sign-in URL is invalid." };
  }
  const localDevelopment = development && url.protocol === "http:" && url.hostname === "localhost";
  const trustedProductionHost =
    url.protocol === "https:" && CLOUD_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
  if (!localDevelopment && !trustedProductionHost) {
    return { available: false, reason: "The configured cloud sign-in URL is not trusted." };
  }
  return { available: true, baseUrl: url.origin };
}

const viteEnvironment = (import.meta as ImportMeta & {
  env?: { DEV?: boolean; VITE_SKRIUW_CLOUD_URL?: string };
}).env;

export const authConfiguration = resolveAuthConfiguration(
  viteEnvironment?.VITE_SKRIUW_CLOUD_URL,
  viteEnvironment?.DEV === true,
);
