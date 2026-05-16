import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { createSupabaseAdminClient } from "@/core/supabase/server-client";
import { DEFAULT_AI_MODEL, isAiModelId } from "@/features/ai/constants";
import type { AiProvider, AiProviderKeyStatus, AiProviderKeySummary } from "@/features/ai/types";
import {
  decryptApiKey,
  encryptApiKey,
  fingerprintApiKey,
  normalizeApiKey,
  normalizeLabel,
  previewApiKey,
} from "@/features/ai/key-utils";

type KeyRow = {
  id: string;
  provider: AiProvider;
  label: string;
  encrypted_key: string;
  key_preview: string;
  status: AiProviderKeyStatus;
  last_tested_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProviderKeyInput = {
  userId: string;
  provider?: AiProvider;
  label: string;
  apiKey: string;
};

function toSummary(row: KeyRow): AiProviderKeySummary {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    keyPreview: row.key_preview,
    status: row.status,
    lastTestedAt: row.last_tested_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAiProviderKeys(userId: string): Promise<AiProviderKeySummary[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("ai_provider_keys")
    .select("id, provider, label, encrypted_key, key_preview, status, last_tested_at, last_used_at, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as KeyRow[]).map(toSummary);
}

export async function createAiProviderKey(input: ProviderKeyInput): Promise<AiProviderKeySummary> {
  const apiKey = normalizeApiKey(input.apiKey);
  const label = normalizeLabel(input.label);
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const provider = input.provider ?? "google";
  const row = {
    user_id: input.userId,
    provider,
    label,
    encrypted_key: encryptApiKey(apiKey),
    key_preview: previewApiKey(apiKey),
    key_fingerprint: fingerprintApiKey(apiKey),
    status: "untested" satisfies AiProviderKeyStatus,
    updated_at: now,
  };

  const { data, error } = await admin
    .from("ai_provider_keys")
    .upsert(row, { onConflict: "user_id,provider,key_fingerprint" })
    .select("id, provider, label, encrypted_key, key_preview, status, last_tested_at, last_used_at, created_at, updated_at")
    .single();

  if (error) throw error;
  return toSummary(data as KeyRow);
}

export async function updateAiProviderKeyLabel({
  userId,
  keyId,
  label,
}: {
  userId: string;
  keyId: string;
  label: string;
}): Promise<AiProviderKeySummary> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("ai_provider_keys")
    .update({ label: normalizeLabel(label), updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", keyId)
    .select("id, provider, label, encrypted_key, key_preview, status, last_tested_at, last_used_at, created_at, updated_at")
    .single();

  if (error) throw error;
  return toSummary(data as KeyRow);
}

export async function deleteAiProviderKey(userId: string, keyId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("ai_provider_keys").delete().eq("user_id", userId).eq("id", keyId);
  if (error) throw error;
}

export async function getDecryptedAiProviderKey({
  userId,
  keyId,
}: {
  userId: string;
  keyId: string;
}): Promise<{ apiKey: string; provider: AiProvider; keyId: string } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("ai_provider_keys")
    .select("id, provider, encrypted_key")
    .eq("user_id", userId)
    .eq("id", keyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  await admin
    .from("ai_provider_keys")
    .update({ last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", keyId);

  return {
    apiKey: decryptApiKey((data as { encrypted_key: string }).encrypted_key),
    provider: (data as { provider: AiProvider }).provider ?? "google",
    keyId,
  };
}

export async function testStoredAiProviderKey({
  userId,
  keyId,
  model,
}: {
  userId: string;
  keyId: string;
  model?: string;
}): Promise<{ ok: true } | { ok: false; code: string; message: string; status: AiProviderKeyStatus }> {
  const stored = await getDecryptedAiProviderKey({ userId, keyId });
  if (!stored) return { ok: false, code: "not_found", message: "Key not found.", status: "error" };

  const selectedModel = isAiModelId(model) ? model : DEFAULT_AI_MODEL;
  const provider = stored.provider;
  let status: AiProviderKeyStatus = "valid";
  let result: { ok: true } | { ok: false; code: string; message: string; status: AiProviderKeyStatus } = { ok: true };

  try {
    const providerInstance =
      provider === "google"
        ? createGoogleGenerativeAI({ apiKey: stored.apiKey })
        : createGroq({ apiKey: stored.apiKey });

    const modelName = selectedModel.includes(".") ? selectedModel.split(".").slice(1).join(".") : selectedModel;

    await generateText({
      model: providerInstance(modelName),
      prompt: "test",
      maxOutputTokens: 1,
    });
  } catch (error) {
    const providerStatus = (error as { status?: number }).status ?? null;
    const message = error instanceof Error ? error.message : "Could not test key.";
    status =
      providerStatus === 429
        ? "rate_limited"
        : providerStatus === 401 || providerStatus === 403
          ? "invalid"
          : "error";
    result = { ok: false, code: status, message, status };
  }

  const admin = createSupabaseAdminClient();
  await admin
    .from("ai_provider_keys")
    .update({
      status,
      last_tested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", keyId);

  return result;
}