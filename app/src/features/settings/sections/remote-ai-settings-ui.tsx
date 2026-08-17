import type { FormEvent } from "react";
import type {
  CredentialVaultDetection,
  RemoteAiCatalog,
  RemoteAiKeyTier,
  RemoteAiProviderState,
} from "@/contracts/ai";
import {
  catalogPricingNote,
  remoteAiCanComplete,
  remoteAiConsentIsCurrent,
  remoteAiConsentStatus,
  remoteAiDisclosure,
  remoteAiKeyLabel,
  remoteAiModelSummary,
  remoteAiModelsFor,
  vaultAcceptsNewKeys,
  vaultMessage,
} from "@/features/ai/remote-ai-model";
import { cn } from "@/shared/lib/utils";
import {
  settingsButton,
  settingsButtonDanger,
  settingsGroup,
  settingsGroupHint,
  settingsGroupTitle,
  settingsRowDescription,
  settingsTextInput,
} from "./settings-shared";
import { emptyDraft, type RemoteProviderDraft } from "./remote-ai-draft";

type PanelProps = {
  providers: RemoteAiProviderState[];
  catalog: RemoteAiCatalog | null;
  vault: CredentialVaultDetection | null;
  drafts: Record<string, RemoteProviderDraft>;
  onDraftChange: (providerId: string, change: Partial<RemoteProviderDraft>) => void;
  onAcceptDisclosure: (providerId: string) => void;
  onSaveKey: (providerId: string) => void;
  onVerifyKey: (providerId: string) => void;
  onRemoveKey: (providerId: string) => void;
  onRevoke: (providerId: string) => void;
  onRefreshCatalog: () => void;
};

type CardProps = Pick<
  PanelProps,
  | "catalog"
  | "onDraftChange"
  | "onAcceptDisclosure"
  | "onSaveKey"
  | "onVerifyKey"
  | "onRemoveKey"
  | "onRevoke"
> & {
  provider: RemoteAiProviderState;
  draft: RemoteProviderDraft;
  vaultAvailable: boolean;
};

export function RemoteProvidersPanel({
  providers,
  catalog,
  vault,
  drafts,
  onDraftChange,
  onAcceptDisclosure,
  onSaveKey,
  onVerifyKey,
  onRemoveKey,
  onRevoke,
  onRefreshCatalog,
}: PanelProps) {
  const vaultNote = vaultMessage(vault);
  const vaultAvailable = vaultAcceptsNewKeys(vault);
  return (
    <div className={settingsGroup}>
      <div className={settingsGroupTitle}>Providers</div>
      <p className={settingsGroupHint}>
        Bring your own key. Keys go straight to this device's credential store and are
        never readable from Skriuw again.
      </p>
      {vaultNote ? (
        <p className="mb-3 rounded-lg border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          {vaultNote}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        {providers.map((provider) => (
          <RemoteProviderCard
            key={provider.providerId}
            provider={provider}
            draft={drafts[provider.providerId] ?? emptyDraft()}
            catalog={catalog}
            vaultAvailable={vaultAvailable}
            onDraftChange={onDraftChange}
            onAcceptDisclosure={onAcceptDisclosure}
            onSaveKey={onSaveKey}
            onVerifyKey={onVerifyKey}
            onRemoveKey={onRemoveKey}
            onRevoke={onRevoke}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">{catalogPricingNote(catalog)}</span>
        <button type="button" className={settingsButton} onClick={onRefreshCatalog}>
          Refresh catalog
        </button>
      </div>
    </div>
  );
}

function RemoteProviderCard({
  provider,
  draft,
  catalog,
  vaultAvailable,
  onDraftChange,
  onAcceptDisclosure,
  onSaveKey,
  onVerifyKey,
  onRemoveKey,
  onRevoke,
}: CardProps) {
  const models = remoteAiModelsFor(catalog, provider.providerId);
  const consented = remoteAiConsentIsCurrent(provider);
  const ready = remoteAiCanComplete(provider);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSaveKey(provider.providerId);
  }

  return (
    <section
      aria-label={provider.label}
      className="overflow-hidden rounded-xl border border-border bg-muted/20"
    >
      <header className="flex items-center gap-3 px-3.5 py-3">
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full border",
            ready
              ? "border-emerald-500/40 bg-emerald-500"
              : "border-border bg-muted-foreground/45",
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">{provider.label}</span>
          <span className={settingsRowDescription}>
            {remoteAiKeyLabel(provider)} · {remoteAiConsentStatus(provider)}
          </span>
        </span>
        {consented ? (
          <button
            type="button"
            className={cn(settingsButton, settingsButtonDanger)}
            disabled={draft.busy}
            onClick={() => onRevoke(provider.providerId)}
          >
            Revoke
          </button>
        ) : null}
      </header>

      {consented ? null : (
        <div className="border-t border-border px-3.5 py-3">
          <p className="text-[11px] leading-[1.5] text-muted-foreground">
            {remoteAiDisclosure(provider)}
          </p>
          <button
            type="button"
            className={cn(settingsButton, "mt-2.5")}
            disabled={draft.busy}
            onClick={() => onAcceptDisclosure(provider.providerId)}
          >
            {provider.acceptedDisclosureVersion == null
              ? "Accept and continue"
              : "Review and accept"}
          </button>
        </div>
      )}

      {consented ? (
        <div className="border-t border-border px-3.5 py-3">
          <form className="flex gap-2 max-[620px]:flex-col" onSubmit={handleSubmit}>
            <input
              className={cn(settingsTextInput, "min-w-0 flex-1 max-[620px]:w-full")}
              type="password"
              autoComplete="off"
              spellCheck={false}
              aria-label={`${provider.label} API key`}
              placeholder={provider.keyTier ? "Replace stored key" : "Paste API key"}
              value={draft.key}
              disabled={draft.busy}
              onChange={(event) =>
                onDraftChange(provider.providerId, { key: event.currentTarget.value })
              }
            />
            <button
              type="submit"
              className={settingsButton}
              disabled={draft.busy || draft.key.trim().length === 0}
            >
              Save key
            </button>
          </form>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <KeyTierChoice
              providerId={provider.providerId}
              tier={draft.tier}
              vaultAvailable={vaultAvailable}
              disabled={draft.busy}
              onDraftChange={onDraftChange}
            />
          </div>

          {models.length > 0 ? (
            <label className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground max-[620px]:flex-col max-[620px]:items-start">
              <span>Test with</span>
              <select
                className={cn(settingsTextInput, "w-auto min-w-0 max-[620px]:w-full")}
                value={draft.modelId ?? models[0]?.modelId ?? ""}
                disabled={draft.busy}
                onChange={(event) =>
                  onDraftChange(provider.providerId, { modelId: event.currentTarget.value })
                }
              >
                {models.map((model) => (
                  <option key={model.modelId} value={model.modelId}>
                    {model.label} — {remoteAiModelSummary(model)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mt-3 text-[11px] text-muted-foreground">
              No models are listed for this provider in the catalog.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={settingsButton}
              disabled={draft.busy || models.length === 0 ||
                (!provider.keyTier && draft.key.trim().length === 0)}
              onClick={() => onVerifyKey(provider.providerId)}
            >
              Test key
            </button>
            {provider.keyTier ? (
              <button
                type="button"
                className={cn(settingsButton, draft.removeArmed && settingsButtonDanger)}
                disabled={draft.busy}
                onBlur={() => onDraftChange(provider.providerId, { removeArmed: false })}
                onClick={() => onRemoveKey(provider.providerId)}
              >
                {draft.removeArmed ? "Confirm remove" : "Remove key"}
              </button>
            ) : null}
          </div>

          {draft.status ? (
            <p className="mt-2.5 text-[11px] text-muted-foreground" aria-live="polite">
              {draft.status}
            </p>
          ) : null}
          {draft.error ? (
            <p role="alert" className="mt-2.5 text-[11px] text-destructive">
              {draft.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function KeyTierChoice({
  providerId,
  tier,
  vaultAvailable,
  disabled,
  onDraftChange,
}: {
  providerId: string;
  tier: RemoteAiKeyTier;
  vaultAvailable: boolean;
  disabled: boolean;
  onDraftChange: (providerId: string, change: Partial<RemoteProviderDraft>) => void;
}) {
  return (
    <>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <input
          type="radio"
          name={`${providerId}-key-tier`}
          checked={tier === "vault"}
          disabled={disabled || !vaultAvailable}
          onChange={() => onDraftChange(providerId, { tier: "vault" })}
        />
        System keyring
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <input
          type="radio"
          name={`${providerId}-key-tier`}
          checked={tier === "session-only"}
          disabled={disabled}
          onChange={() => onDraftChange(providerId, { tier: "session-only" })}
        />
        This session only
      </label>
    </>
  );
}
