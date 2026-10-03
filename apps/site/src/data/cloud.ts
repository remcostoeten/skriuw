const DEFAULT_CLOUD_URL = "https://skriuw-v2-cloud.remcostoeten.workers.dev";

/**
 * @name cloudUrl
 * @description Resolves the Skriuw cloud origin from a configured value,
 * falling back to the hosted worker, without a trailing slash.
 *
 * @example
 * fetch(`${cloudUrl(process.env.SKRIUW_CLOUD_URL)}/shares/${id}`);
 */
export function cloudUrl(configured: string | undefined) {
  return (configured || DEFAULT_CLOUD_URL).replace(/\/+$/, "");
}
