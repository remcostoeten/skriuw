#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const exportRoot = new URL("../web/out/", import.meta.url);

const marketingRoutes = [
  {
    path: "/download/",
    file: "download/index.html",
    heading: "Install it.",
  },
  {
    path: "/local-first-notes/",
    file: "local-first-notes/index.html",
    heading: "A notes app that starts on your machine.",
  },
  {
    path: "/markdown-notes/",
    file: "markdown-notes/index.html",
    heading: "Markdown when you want it.",
  },
  {
    path: "/import/",
    file: "import/index.html",
    heading: "Bring the archive.",
  },
];

const [siteHtml, appHtml, robots, sitemap, vercelConfigSource, ...routeHtml] =
  await Promise.all([
    readExport("index.html"),
    readFile(new URL("../app/index.html", import.meta.url), "utf8"),
    readExport("robots.txt"),
    readExport("sitemap.xml"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    ...marketingRoutes.map((route) => readExport(route.file)),
  ]);
const socialImage = await readFile(new URL("og-image.png", exportRoot));
const vercelConfig = JSON.parse(vercelConfigSource);

assert.match(siteHtml, /<title>Skriuw: Fast, Private, Local-First Notes<\/title>/u);
assert.match(siteHtml, /<meta\s+name="description"/u);
assert.equal(canonicalUrl(siteHtml), "https://skriuw.com/");
assert.match(siteHtml, /<h1[^>]*>Notes that never[\s\S]*?make you wait/u);

const schema = JSON.parse(structuredData(siteHtml));
const website = schema["@graph"].find((entry) => entry["@type"] === "WebSite");
const organization = schema["@graph"].find((entry) => entry["@type"] === "Organization");
const application = schema["@graph"].find(
  (entry) => entry["@type"] === "SoftwareApplication",
);
assert.equal(website.name, "Skriuw");
assert.equal(website.url, "https://skriuw.com/");
assert.equal(organization.logo.url, "https://skriuw.com/app-icon.png");
assert.equal(application.name, "Skriuw");
assert.equal(application.url, "https://skriuw.com/");

assertOpenGraphImage(siteHtml);
assert.match(siteHtml, /<meta\s+name="twitter:image:alt"/u);
assert.equal(socialImage.subarray(1, 4).toString("ascii"), "PNG");
assert.equal(socialImage.readUInt32BE(16), 1200);
assert.equal(socialImage.readUInt32BE(20), 630);

const pageTitles = new Set([pageTitle(siteHtml)]);
const pageDescriptions = new Set([pageDescription(siteHtml)]);
for (const [index, route] of marketingRoutes.entries()) {
  const html = routeHtml[index];
  assert.equal(canonicalUrl(html), `https://skriuw.com${route.path}`);
  assert.match(html, new RegExp(`<h1[^>]*>[\\s\\S]*?${escapePattern(route.heading)}`, "u"));
  assertOpenGraphImage(html);
  assert.match(html, /<meta\s+name="twitter:card"\s+content="summary_large_image"\s*\/>/u);
  const routeSchema = JSON.parse(structuredData(html));
  assert.equal(routeSchema.url, `https://skriuw.com${route.path}`);
  pageTitles.add(pageTitle(html));
  pageDescriptions.add(pageDescription(html));
  assert.match(siteHtml, new RegExp(`href="${escapePattern(route.path)}"`, "u"));
  assert.match(sitemap, new RegExp(`<loc>https://skriuw\\.com${escapePattern(route.path)}</loc>`, "u"));
}
assert.equal(pageTitles.size, marketingRoutes.length + 1, "marketing page titles must be unique");
assert.equal(
  pageDescriptions.size,
  marketingRoutes.length + 1,
  "marketing page descriptions must be unique",
);

assert.equal(canonicalUrl(appHtml), "https://skriuw.com/app/");
assert.match(appHtml, /<meta name="robots" content="noindex, follow" \/>/u);
assert.match(robots, /^User-agent: \*$/imu);
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

async function readExport(file) {
  try {
    return await readFile(new URL(file, exportRoot), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `web/out/${file} is missing. Run "bun --cwd web run build" before the SEO checks.`,
      );
    }
    throw error;
  }
}

function structuredData(html) {
  const match = html.match(
    /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/u,
  )?.[1];
  assert.ok(match, "each marketing page must include JSON-LD structured data");
  return match;
}

function assertOpenGraphImage(html) {
  assert.match(
    html,
    /<meta\s+property="og:image"\s+content="https:\/\/skriuw\.com\/og-image\.png"\s*\/>/u,
  );
  assert.match(html, /<meta\s+property="og:image:width"\s+content="1200"\s*\/>/u);
  assert.match(html, /<meta\s+property="og:image:height"\s+content="630"\s*\/>/u);
}

function canonicalUrl(html) {
  const matches = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"\s*\/>/gu)];
  assert.equal(matches.length, 1, "each page must declare exactly one canonical URL");
  return matches[0][1];
}

function pageTitle(html) {
  const title = html.match(/<title>([^<]+)<\/title>/u)?.[1];
  assert.ok(title, "each marketing page must declare a title");
  return title;
}

function pageDescription(html) {
  const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"\s*\/>/u)?.[1];
  assert.ok(description, "each marketing page must declare a description");
  return description;
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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
