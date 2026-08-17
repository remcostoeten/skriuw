import { invoke, requireDesktopRuntime } from "@/bridge/runtime";
import type {
  CredentialVaultDetection,
  RemoteAiCatalog,
  RemoteAiKeyTier,
  RemoteAiProviderState,
} from "@/contracts/ai";

export type RemoteAiSnapshot = {
  vault: CredentialVaultDetection;
  providers: RemoteAiProviderState[];
  catalog: RemoteAiCatalog;
};

export function remoteAiProviders(): Promise<RemoteAiProviderState[]> {
  requireDesktop();
  return invoke<RemoteAiProviderState[]>("remote_ai_providers");
}

export function credentialVaultState(): Promise<CredentialVaultDetection> {
  requireDesktop();
  return invoke<CredentialVaultDetection>("credential_vault_state");
}

export function remoteAiCatalog(): Promise<RemoteAiCatalog> {
  requireDesktop();
  return invoke<RemoteAiCatalog>("remote_ai_catalogue");
}

export async function loadRemoteAiSnapshot(): Promise<RemoteAiSnapshot> {
  const [vault, providers, catalog] = await Promise.all([
    credentialVaultState(),
    remoteAiProviders(),
    remoteAiCatalog(),
  ]);
  return { vault, providers, catalog };
}

export function saveRemoteAiKey(
  providerId: string,
  key: string,
  tier: RemoteAiKeyTier,
): Promise<RemoteAiProviderState[]> {
  requireDesktop();
  return invoke<RemoteAiProviderState[]>("save_remote_ai_key", { providerId, key, tier });
}

export function removeRemoteAiKey(providerId: string): Promise<RemoteAiProviderState[]> {
  requireDesktop();
  return invoke<RemoteAiProviderState[]>("remove_remote_ai_key", { providerId });
}

export function acceptRemoteAiDisclosure(
  providerId: string,
): Promise<RemoteAiProviderState[]> {
  requireDesktop();
  return invoke<RemoteAiProviderState[]>("accept_remote_ai_disclosure", { providerId });
}

export function revokeRemoteAiProvider(
  providerId: string,
): Promise<RemoteAiProviderState[]> {
  requireDesktop();
  return invoke<RemoteAiProviderState[]>("revoke_remote_ai_provider", { providerId });
}

/**
 * Spends one key on the smallest metered request the provider offers. Callers
 * must run this from an explicit user action: it costs the user money.
 */
export function verifyRemoteAiKey(
  providerId: string,
  modelId: string,
  key: string | null,
): Promise<void> {
  requireDesktop();
  return invoke<void>("verify_remote_ai_key", { providerId, modelId, key });
}

function requireDesktop(): void {
  requireDesktopRuntime("Remote AI provider keys");
}
