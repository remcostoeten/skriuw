import type { RemoteAiKeyTier } from "@/contracts/ai";

/**
 * The per-provider editing state of the settings card. `key` holds only what
 * the user is typing right now: it is cleared as soon as the key is handed to
 * the native store, and a stored key is never read back into it.
 */
export type RemoteProviderDraft = {
  key: string;
  tier: RemoteAiKeyTier;
  modelId: string | null;
  status: string | null;
  error: string | null;
  busy: boolean;
  removeArmed: boolean;
};

export function emptyDraft(): RemoteProviderDraft {
  return {
    key: "",
    tier: "vault",
    modelId: null,
    status: null,
    error: null,
    busy: false,
    removeArmed: false,
  };
}
