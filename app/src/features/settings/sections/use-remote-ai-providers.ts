import { useEffect, useState } from "react";
import type {
  CredentialVaultDetection,
  RemoteAiModelDirectory,
  RemoteAiProviderState,
} from "@/contracts/ai";
import {
  acceptRemoteAiDisclosure,
  loadRemoteAiSnapshot,
  refreshRemoteAiModels,
  removeRemoteAiKey,
  revokeRemoteAiProvider,
  saveRemoteAiKey,
  verifyRemoteAiKey,
} from "@/features/ai/remote-ai-bridge";
import {
  availableRemoteModel,
  remoteAiErrorMessage,
  remoteAiModelsFor,
  vaultAcceptsNewKeys,
} from "@/features/ai/remote-ai-model";
import { emptyDraft, type RemoteProviderDraft } from "./remote-ai-draft";

export type RemoteAiProviders = {
  providers: RemoteAiProviderState[];
  models: RemoteAiModelDirectory | null;
  vault: CredentialVaultDetection | null;
  drafts: Record<string, RemoteProviderDraft>;
  error: string | null;
  changeDraft: (providerId: string, change: Partial<RemoteProviderDraft>) => void;
  acceptDisclosure: (providerId: string) => void;
  saveKey: (providerId: string) => void;
  verifyKey: (providerId: string) => void;
  removeKey: (providerId: string) => void;
  revoke: (providerId: string) => void;
  refreshModels: (providerId: string) => void;
};

/**
 * Remote provider state for the settings surface. Nothing here runs before the
 * AI section mounts, and no read is polled: reaching the credential store can
 * prompt the operating-system keyring, so it happens once per explicit action.
 */
export function useRemoteAiProviders(signal: AbortSignal): RemoteAiProviders {
  const [providers, setProviders] = useState<RemoteAiProviderState[]>([]);
  const [models, setModels] = useState<RemoteAiModelDirectory | null>(null);
  const [vault, setVault] = useState<CredentialVaultDetection | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RemoteProviderDraft>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadRemoteAiSnapshot().then(
      (snapshot) => {
        if (!active || signal.aborted) return;
        setVault(snapshot.vault);
        setModels(snapshot.models);
        setProviders(snapshot.providers);
        setDrafts(seedDrafts(snapshot.providers, snapshot.models, snapshot.vault));
      },
      (reason: unknown) => {
        if (active && !signal.aborted) setError(remoteAiErrorMessage(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [signal]);

  function changeDraft(providerId: string, change: Partial<RemoteProviderDraft>): void {
    setDrafts((current) => ({
      ...current,
      [providerId]: { ...(current[providerId] ?? emptyDraft()), ...change },
    }));
  }

  async function run(
    providerId: string,
    action: () => Promise<RemoteAiProviderState[] | null>,
    status: string | null,
  ): Promise<void> {
    changeDraft(providerId, { busy: true, error: null, status: null });
    try {
      const next = await action();
      if (signal.aborted) return;
      if (next) setProviders(next);
      changeDraft(providerId, { busy: false, status });
    } catch (reason) {
      if (signal.aborted) return;
      changeDraft(providerId, { busy: false, error: remoteAiErrorMessage(reason) });
    }
  }

  function saveKey(providerId: string): void {
    const draft = drafts[providerId];
    const key = draft?.key.trim();
    if (!key) return;
    const tier = vaultAcceptsNewKeys(vault) ? (draft?.tier ?? "vault") : "session-only";
    void run(
      providerId,
      async () => {
        const next = await saveRemoteAiKey(providerId, key, tier);
        changeDraft(providerId, { key: "" });
        return next;
      },
      tier === "vault" ? "Key stored in the system keyring." : "Key held for this session.",
    );
  }

  function verifyKey(providerId: string): void {
    const draft = drafts[providerId];
    const modelId = availableRemoteModel(
      draft?.modelId ?? null,
      remoteAiModelsFor(models, providerId),
    );
    if (!modelId) return;
    void run(
      providerId,
      async () => {
        await verifyRemoteAiKey(providerId, modelId, draft?.key.trim() || null);
        return null;
      },
      "The provider accepted this key.",
    );
  }

  function removeKey(providerId: string): void {
    if (!drafts[providerId]?.removeArmed) {
      changeDraft(providerId, { removeArmed: true });
      return;
    }
    void run(
      providerId,
      async () => {
        const next = await removeRemoteAiKey(providerId);
        changeDraft(providerId, { removeArmed: false });
        return next;
      },
      "Key removed from this device.",
    );
  }

  async function refreshModels(providerId: string): Promise<void> {
    changeDraft(providerId, { busy: true, error: null, status: null });
    try {
      const next = await refreshRemoteAiModels(providerId);
      if (signal.aborted) return;
      setModels(next);
      const fetched = next.models.filter(
        (model) => model.providerId === providerId && model.source === "fetched",
      ).length;
      changeDraft(providerId, {
        busy: false,
        status: `The provider listed ${fetched} model${fetched === 1 ? "" : "s"} beyond the catalog.`,
      });
    } catch (reason) {
      if (signal.aborted) return;
      changeDraft(providerId, { busy: false, error: remoteAiErrorMessage(reason) });
    }
  }

  return {
    providers,
    models,
    vault,
    drafts,
    error,
    changeDraft,
    acceptDisclosure: (providerId) =>
      void run(providerId, () => acceptRemoteAiDisclosure(providerId), null),
    saveKey,
    verifyKey,
    removeKey,
    revoke: (providerId) =>
      void run(
        providerId,
        () => revokeRemoteAiProvider(providerId),
        "Consent withdrawn and the key deleted.",
      ),
    refreshModels: (providerId) => void refreshModels(providerId),
  };
}

function seedDrafts(
  providers: readonly RemoteAiProviderState[],
  models: RemoteAiModelDirectory | null,
  vault: CredentialVaultDetection | null,
): Record<string, RemoteProviderDraft> {
  const tier = vaultAcceptsNewKeys(vault) ? "vault" : "session-only";
  return Object.fromEntries(
    providers.map((provider) => [
      provider.providerId,
      {
        ...emptyDraft(),
        tier,
        modelId: availableRemoteModel(null, remoteAiModelsFor(models, provider.providerId)),
      },
    ]),
  );
}
