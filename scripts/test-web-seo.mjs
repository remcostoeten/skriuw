#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [siteHtml, appHtml, robots, sitemap, vercelConfigSource] = await Promise.all([
  readFile(new URL("../site/index.html", import.meta.url), "utf8"),
  readFile(new URL("../app/index.html", import.meta.url), "utf8"),
  readFile(new URL("../site/robots.txt", import.meta.url), "utf8"),
  readFile(new URL("../site/sitemap.xml", import.meta.url), "utf8"),
  readFile(new URL("../vercel.json", import.meta.url), "utf8"),
]);

const vercelConfig = JSON.parse(vercelConfigSource);
const schemaMatch = siteHtml.match(
  /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/u,
);

assert.match(siteHtml, /<title>Skriuw — Fast, Private, Local-First Notes App<\/title>/u);
assert.match(siteHtml, /<meta\s+name="description"/u);
assert.equal(canonicalUrls(siteHtml), "https://skriuw.com/");
assert.match(siteHtml, /<h1[^>]*>Your words<br \/>stay close\.<\/h1>/u);
assert.ok(schemaMatch?.[1], "homepage must include JSON-LD structured data");

const schema = JSON.parse(schemaMatch[1]);
assert.equal(schema["@type"], "SoftwareApplication");
assert.equal(schema.name, "Skriuw");
assert.equal(schema.url, "https://skriuw.com/");

assert.equal(canonicalUrls(appHtml), "https://skriuw.com/app/");
assert.match(appHtml, /<meta name="robots" content="noindex, follow" \/>/u);
assert.match(robots, /^User-agent: \*$/mu);
assert.match(robots, /^Sitemap: https:\/\/skriuw\.com\/sitemap\.xml$/mu);
assert.match(sitemap, /<loc>https:\/\/skriuw\.com\/<\/loc>/u);
assert.doesNotMatch(sitemap, /vercel\.app/u);
assert.doesNotMatch(sitemap, /<loc>https:\/\/skriuw\.com\/app\//u);

assertHostRedirect(vercelConfig, "skriuw.vercel.app");
assertHostRedirect(vercelConfig, "www.skriuw.com");

const vercelNoIndex = vercelConfig.headers.find((entry) =>
  entry.has?.some(
    (condition) => condition.type === "host" && condition.value === "skriuw.vercel.app",
  ),
);
assert.ok(vercelNoIndex, "skriuw.vercel.app must set an indexing header");
assert.ok(
  vercelNoIndex.headers.some(
    (header) => header.key === "X-Robots-Tag" && header.value === "noindex",
  ),
  "skriuw.vercel.app must set X-Robots-Tag: noindex",
);

process.stdout.write("web SEO configuration passed\n");

function canonicalUrls(html) {
  const matches = [
    ...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"\s*\/>/gu),
  ];
  assert.equal(matches.length, 1, "each page must declare exactly one canonical URL");
  return matches[0][1];
}

function assertHostRedirect(config, hostname) {
  const redirect = config.redirects.find((entry) =>
    entry.has?.some(
      (condition) => condition.type === "host" && condition.value === hostname,
    ),
  );
  assert.ok(redirect, `${hostname} must redirect to the canonical host`);
  assert.equal(redirect.permanent, true, `${hostname} redirect must be permanent`);
  assert.equal(redirect.destination, "https://skriuw.com/:path*");
}
