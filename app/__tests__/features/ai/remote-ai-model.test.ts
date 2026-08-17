import assert from "node:assert/strict";
import test from "node:test";
import type { RemoteAiCatalog, RemoteAiProviderState } from "../../../src/contracts/ai";
import {
  availableRemoteModel,
  catalogPricingNote,
  formatContextWindow,
  formatPricePerMtok,
  remoteAiCanComplete,
  remoteAiConsentIsCurrent,
  remoteAiConsentStatus,
  remoteAiDisclosure,
  remoteAiErrorMessage,
  remoteAiKeyLabel,
  remoteAiModelSummary,
  remoteAiModelsFor,
  vaultAcceptsNewKeys,
  vaultMessage,
} from "../../../src/features/ai/remote-ai-model";

function provider(overrides: Partial<RemoteAiProviderState> = {}): RemoteAiProviderState {
  return {
    providerId: "groq",
    label: "Groq",
    destination: "api.groq.com",
    keyTier: null,
    acceptedDisclosureVersion: null,
    currentDisclosureVersion: 1,
    ...overrides,
  };
}

const catalog: RemoteAiCatalog = {
  version: 1,
  pricingAsOf: "2026-08-01",
  models: [
    {
      providerId: "groq",
      modelId: "openai/gpt-oss-20b",
      label: "GPT-OSS 20B",
      contextWindowTokens: 131_072,
      inputPriceMicrosPerMtok: 75_000,
      outputPriceMicrosPerMtok: 300_000,
    },
    {
      providerId: "gemini",
      modelId: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      contextWindowTokens: 1_048_576,
      inputPriceMicrosPerMtok: 1_250_000,
      outputPriceMicrosPerMtok: 10_000_000,
    },
  ],
};

test("a provider is only ready once it holds a key and current consent", () => {
  assert.equal(remoteAiCanComplete(provider()), false);
  assert.equal(remoteAiCanComplete(provider({ keyTier: "vault" })), false);
  assert.equal(
    remoteAiCanComplete(provider({ keyTier: "vault", acceptedDisclosureVersion: 1 })),
    true,
  );
});

test("a disclosure accepted at an older version stops authorising the provider", () => {
  const stale = provider({ keyTier: "vault", acceptedDisclosureVersion: 0 });

  assert.equal(remoteAiConsentIsCurrent(stale), false);
  assert.equal(remoteAiCanComplete(stale), false);
  assert.equal(remoteAiConsentStatus(stale), "Disclosure changed since you accepted it");
  assert.equal(remoteAiConsentStatus(provider()), "Disclosure not accepted");
  assert.equal(
    remoteAiConsentStatus(provider({ acceptedDisclosureVersion: 1 })),
    "Disclosure accepted",
  );
});

test("the disclosure names the destination the adapter actually reaches", () => {
  const disclosure = remoteAiDisclosure(provider());

  assert.match(disclosure, /api\.groq\.com/);
  assert.match(disclosure, /leaves this device/);
});

test("key tier is described without ever revealing a key", () => {
  assert.equal(remoteAiKeyLabel(provider()), "No key configured");
  assert.equal(remoteAiKeyLabel(provider({ keyTier: "vault" })), "Key stored in the system keyring");
  assert.equal(
    remoteAiKeyLabel(provider({ keyTier: "session-only" })),
    "Key held for this session only",
  );
});

test("only a usable vault accepts a persisted key", () => {
  assert.equal(vaultAcceptsNewKeys({ state: "vault-ok" }), true);
  assert.equal(vaultAcceptsNewKeys({ state: "vault-no-collection" }), true);
  assert.equal(vaultAcceptsNewKeys({ state: "vault-locked" }), false);
  assert.equal(vaultAcceptsNewKeys(null), false);
});

test("vault detail from the device wins over the generic message", () => {
  assert.equal(vaultMessage({ state: "vault-ok" }), null);
  assert.equal(
    vaultMessage({ state: "vault-blocked", detail: "Run: snap connect skriuw:password-manager-service" }),
    "Run: snap connect skriuw:password-manager-service",
  );
  assert.match(String(vaultMessage({ state: "vault-locked" })), /Unlock your system keyring/);
});

test("catalog models are selected per provider and fall back to the first entry", () => {
  const groq = remoteAiModelsFor(catalog, "groq");

  assert.equal(groq.length, 1);
  assert.equal(availableRemoteModel("missing-model", groq), "openai/gpt-oss-20b");
  assert.equal(availableRemoteModel("openai/gpt-oss-20b", groq), "openai/gpt-oss-20b");
  assert.equal(availableRemoteModel(null, []), null);
  assert.deepEqual(remoteAiModelsFor(null, "groq"), []);
});

test("prices render from integer micro-dollars without floating-point money", () => {
  assert.equal(formatPricePerMtok(50_000), "$0.05/MTok");
  assert.equal(formatPricePerMtok(1_250_000), "$1.25/MTok");
  assert.equal(formatPricePerMtok(10_000_000), "$10.00/MTok");
  assert.equal(formatContextWindow(1_048_576), "1M context");
  assert.equal(formatContextWindow(131_072), "131K context");
  assert.equal(formatContextWindow(512), "512 context");
});

test("model summary and pricing note admit how old the figures are", () => {
  assert.equal(
    remoteAiModelSummary(catalog.models[1]!),
    "1M context · in $1.25/MTok · out $10.00/MTok",
  );
  assert.match(catalogPricingNote(catalog), /prices recorded 2026-08-01, not read live/);
  assert.equal(catalogPricingNote(null), "Catalog unavailable.");
});

test("provider failures keep their distinct recovery path", () => {
  assert.equal(
    remoteAiErrorMessage({
      providerId: "groq",
      category: "invalid_credential",
      message: "the provider rejected this API key",
      recoveryAction: "configure_credential",
    }),
    "the provider rejected this API key Check the key and try again.",
  );
  assert.equal(
    remoteAiErrorMessage({
      providerId: "groq",
      category: "quota_exhausted",
      message: "this provider account has no remaining credit",
      recoveryAction: "contact_provider",
    }),
    "this provider account has no remaining credit Add credit with the provider.",
  );
  assert.equal(
    remoteAiErrorMessage({
      providerId: "groq",
      category: "transport_failure",
      message: "Skriuw could not reach the provider.",
      recoveryAction: "retry",
    }),
    "Skriuw could not reach the provider. Try again.",
  );
  assert.equal(remoteAiErrorMessage(new Error("boom")), "boom");
  assert.equal(remoteAiErrorMessage("plain"), "plain");
});
