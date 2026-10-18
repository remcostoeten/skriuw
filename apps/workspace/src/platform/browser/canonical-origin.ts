const CANONICAL_BROWSER_ORIGIN = "https://skriuw.com";
const DEPLOYMENT_ALIAS_HOST = "skriuw.vercel.app";

/**
 * @name canonicalBrowserUrl
 * @description Returns the canonical browser URL when the app opened on its Vercel deployment alias.
 *
 * @example
 * canonicalBrowserUrl("https://skriuw.vercel.app/app/?note=1#editor");
 */
export function canonicalBrowserUrl(currentUrl: string): string | null {
  const url = new URL(currentUrl);
  if (url.hostname !== DEPLOYMENT_ALIAS_HOST) {
    return null;
  }
  return new URL(`${url.pathname}${url.search}${url.hash}`, CANONICAL_BROWSER_ORIGIN).href;
}
