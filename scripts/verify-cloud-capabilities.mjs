#!/usr/bin/env node

// Reads the unauthenticated capability report a Skriuw cloud deployment
// serves on GET /health and fails when it cannot serve what current clients
// require. Run it against any deployment:
//
//   node scripts/verify-cloud-capabilities.mjs
//   node scripts/verify-cloud-capabilities.mjs https://skriuw-v2-cloud-preview.remcostoeten.workers.dev

const PRODUCTION_CLOUD_URL = "https://skriuw-v2-cloud.remcostoeten.workers.dev";
const REQUIRED_SYNC_PROTOCOL_VERSION = 2;
const REQUIRED_DURABLE_OBJECT_SCHEMA_VERSION = 4;
const REQUIRED_ROUTES = [
  "push",
  "pull",
  "chunk",
  "checkpoint",
  "encryption",
  "acknowledge",
  "events",
];

const baseUrl = new URL(process.argv[2] ?? PRODUCTION_CLOUD_URL);

try {
  const report = await readCapabilityReport(baseUrl);
  verifyCapabilities(report);
  process.stdout.write(
    `cloud capabilities verified: ${baseUrl.origin} serves sync protocol ${report.syncProtocolVersions.join(", ")}, workspace schema ${report.durableObjectSchemaVersion}, routes ${report.routes.join(", ")}\n`,
  );
} catch (failure) {
  process.stderr.write(
    `cloud capability check FAILED for ${baseUrl.origin}: ${failure.message}\n`,
  );
  process.exitCode = 1;
}

async function readCapabilityReport(url) {
  const response = await fetch(new URL("/health", url));
  if (!response.ok) {
    throw new Error(`/health returned HTTP ${response.status}`);
  }
  const report = await response.json();
  if (report === null || typeof report !== "object") {
    throw new Error("/health did not return a capability report");
  }
  return report;
}

function verifyCapabilities(report) {
  const missing = [];

  const versions = Array.isArray(report.syncProtocolVersions)
    ? report.syncProtocolVersions
    : null;
  if (versions === null) {
    missing.push("syncProtocolVersions is absent: this deployment predates the capability report");
  } else if (!versions.includes(REQUIRED_SYNC_PROTOCOL_VERSION)) {
    missing.push(
      `sync protocol ${REQUIRED_SYNC_PROTOCOL_VERSION} is not served (serves ${versions.join(", ")})`,
    );
  }

  const schema = report.durableObjectSchemaVersion;
  if (typeof schema !== "number") {
    missing.push("durableObjectSchemaVersion is absent");
  } else if (schema < REQUIRED_DURABLE_OBJECT_SCHEMA_VERSION) {
    missing.push(
      `workspace schema ${REQUIRED_DURABLE_OBJECT_SCHEMA_VERSION} is not applied (reports ${schema})`,
    );
  }

  const routes = Array.isArray(report.routes) ? report.routes : null;
  if (routes === null) {
    missing.push("routes is absent");
  } else {
    for (const route of REQUIRED_ROUTES) {
      if (!routes.includes(route)) {
        missing.push(`the ${route} route is not served`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`missing capabilities:\n  - ${missing.join("\n  - ")}`);
  }
}
