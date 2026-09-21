/**
 * Which cloud origin this build will send an account credential to.
 *
 * The rules are the ones `crates/skriuw-mobile` enforces again before any
 * request leaves the device, restated here so a misconfigured build fails at
 * startup with something a developer can read rather than as an opaque refusal
 * from the core. Parsing is by hand rather than through `URL`: React Native's
 * implementation is a partial polyfill, and a trust decision must not depend
 * on which parts of it a given runtime shipped.
 */

const TRUSTED_HOST_SUFFIXES = [".skriuw.app", ".workers.dev"] as const;

/**
 * `10.0.2.2` is the Android emulator's route to the host machine, which is how
 * an emulator reaches a Worker running on the development machine.
 */
const DEVELOPMENT_ORIGIN_PREFIXES = [
  "http://localhost",
  "http://127.0.0.1",
  "http://10.0.2.2",
] as const;

export const PRODUCTION_CLOUD_URL = "https://skriuw-v2-cloud.remcostoeten.workers.dev";

export type CloudConfiguration =
  | { available: true; baseUrl: string }
  | { available: false; reason: string };

/**
 * What the shell knows about its own build. `cloudUrl` is
 * `EXPO_PUBLIC_SKRIUW_CLOUD_URL` and `development` is `__DEV__`; both are
 * passed in rather than read here so this module stays testable and free of
 * bundler globals.
 */
export type CloudEnvironment = {
  cloudUrl?: string | undefined;
  development?: boolean | undefined;
};

export function resolveCloudConfiguration(environment: CloudEnvironment): CloudConfiguration {
  const configured = environment.cloudUrl?.trim();
  if (!configured) {
    return { available: true, baseUrl: PRODUCTION_CLOUD_URL };
  }
  const baseUrl = configured.replace(/\/+$/, "");
  if (baseUrl.length > 2048 || /[?#@\s]/.test(baseUrl)) {
    return { available: false, reason: "The configured cloud sign-in URL is invalid." };
  }
  if (isTrustedHttpsOrigin(baseUrl)) {
    return { available: true, baseUrl };
  }
  if (environment.development === true && isDevelopmentOrigin(baseUrl)) {
    return { available: true, baseUrl };
  }
  return { available: false, reason: "The configured cloud sign-in URL is not trusted." };
}

function isTrustedHttpsOrigin(baseUrl: string): boolean {
  if (!baseUrl.startsWith("https://")) return false;
  const host = baseUrl.slice("https://".length).split(/[/:]/, 1)[0] ?? "";
  return host.length > 0 && TRUSTED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function isDevelopmentOrigin(baseUrl: string): boolean {
  return DEVELOPMENT_ORIGIN_PREFIXES.some((prefix) => {
    if (!baseUrl.startsWith(prefix)) return false;
    const rest = baseUrl.slice(prefix.length);
    return rest.length === 0 || rest.startsWith(":") || rest.startsWith("/");
  });
}
