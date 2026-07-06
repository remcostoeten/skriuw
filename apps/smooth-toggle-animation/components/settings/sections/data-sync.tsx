"use client"

import { useState } from "react"
import { Check, Copy, Download, KeyRound, Plus, Trash2, Upload } from "lucide-react"
import { AnimatedList, AnimatedReveal } from "../animated-list"
import {
  GroupLabel,
  Row,
  SectionHeader,
  SettingsButton,
  SettingsCard,
  SettingsDialog,
  SettingsInput,
  SettingsSelect,
  TypePhraseDialog,
} from "../primitives"

type SyncToken = { id: string; name: string; prefix: string; created: string; lastUsed: string }

export function DataSyncSection() {
  const [includeHistory, setIncludeHistory] = useState(true)
  const [exportState, setExportState] = useState<"idle" | "exporting">("idle")

  const [importOpen, setImportOpen] = useState(false)
  const [sourceFormat, setSourceFormat] = useState("auto")
  const [importPolicy, setImportPolicy] = useState("merge")
  const [replacePhrase, setReplacePhrase] = useState("")

  const [tokenName, setTokenName] = useState("")
  const [creating, setCreating] = useState(false)
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [tokens, setTokens] = useState<SyncToken[]>([
    { id: "1", name: "MacBook Pro", prefix: "sk_sync_a3f8", created: "12 days ago", lastUsed: "2 hours ago" },
  ])

  const [clearOpen, setClearOpen] = useState(false)

  function doExport() {
    setExportState("exporting")
    setTimeout(() => setExportState("idle"), 1200)
  }

  function createToken() {
    if (!tokenName.trim()) return
    setCreating(true)
    setTimeout(() => {
      const token = `sk_sync_${Math.random().toString(36).slice(2, 14)}`
      setFreshToken(token)
      setTokens((t) => [
        { id: String(Date.now()), name: tokenName, prefix: token.slice(0, 12), created: "just now", lastUsed: "never" },
        ...t,
      ])
      setTokenName("")
      setCreating(false)
    }, 600)
  }

  const importBtnLabel = {
    merge: "Import new items",
    overwrite: "Import with overwrite",
    duplicate: "Import as duplicates",
    "replace-workspace": "Replace workspace",
  }[importPolicy]

  return (
    <div>
      <SectionHeader
        title="Data & sync"
        description="Your notes are yours. Export, import, or back them up anytime."
      />

      <SettingsCard>
        <Row
          title="Export notes"
          description="Download notes, folders, journal entries, tags, and optional version history as a Skriuw v3 ZIP."
        >
          <div className="flex flex-col items-end gap-2">
            <SettingsButton icon={<Download className="h-3.5 w-3.5" />} onClick={doExport} disabled={exportState === "exporting"}>
              {exportState === "exporting" ? "Exporting…" : "Export"}
            </SettingsButton>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={includeHistory}
                onChange={(e) => setIncludeHistory(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              Include version history
            </label>
          </div>
        </Row>
        <Row
          title="Import backup"
          description="Import a Skriuw backup or Markdown folder ZIP. Choose merge, overwrite, or full workspace replace."
        >
          <SettingsButton icon={<Upload className="h-3.5 w-3.5" />} onClick={() => setImportOpen(true)}>
            Import
          </SettingsButton>
        </Row>
      </SettingsCard>

      <GroupLabel>Desktop app</GroupLabel>
      <div className="rounded-lg border border-[var(--border)]/60 bg-[var(--card)]/40 p-5">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground">Desktop sync</div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Create a scoped token so the desktop app can pull your cloud workspace through /api/sync/export.
            </p>

            <div className="mt-3 flex gap-2">
              <SettingsInput
                id="desktop-sync-token-name"
                value={tokenName}
                onChange={setTokenName}
                placeholder="Desktop app"
                maxLength={80}
                className="flex-1"
                ariaLabel="Token name"
              />
              <SettingsButton icon={<Plus className="h-3.5 w-3.5" />} onClick={createToken} disabled={creating || !tokenName.trim()}>
                {creating ? "Creating…" : "Create"}
              </SettingsButton>
            </div>

            <AnimatedReveal show={Boolean(freshToken)}>
              <div className="mt-3 rounded-md border border-[var(--warning)]/30 bg-[var(--warning)]/10 p-3">
                <p className="text-[11px] font-medium text-[var(--warning)]">
                  Copy this token now. It will not be shown again.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-[var(--muted)]/60 px-2 py-1 font-mono text-[11px] text-foreground">
                    {freshToken}
                  </code>
                  <SettingsButton
                    icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    onClick={() => {
                      if (freshToken) navigator.clipboard?.writeText(freshToken)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    }}
                  >
                    {copied ? "Copied" : "Copy"}
                  </SettingsButton>
                </div>
              </div>
            </AnimatedReveal>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Active tokens
                </span>
                <button className="text-[11px] text-muted-foreground hover:text-foreground">Refresh</button>
              </div>
              <AnimatedList
                items={tokens}
                className="mt-2"
                itemClassName="pb-2"
                empty={<p className="mt-2 text-[11px] text-muted-foreground">No active desktop sync tokens yet.</p>}
                renderItem={(token) => (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)]/50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-foreground">{token.name}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {token.prefix}
                        {"… · created "}
                        {token.created}
                        {" · last used "}
                        {token.lastUsed}
                      </div>
                    </div>
                    <SettingsButton
                      variant="destructive"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() => setTokens((t) => t.filter((x) => x.id !== token.id))}
                    >
                      Revoke
                    </SettingsButton>
                  </div>
                )}
              />
            </div>
          </div>
        </div>
      </div>

      <GroupLabel>Danger zone</GroupLabel>
      <SettingsCard>
        <Row
          title="Clear all data"
          description="Permanently delete all notes, folders, journal entries, and tags. Account and AI keys are kept."
        >
          <SettingsButton variant="destructive" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setClearOpen(true)}>
            Clear data
          </SettingsButton>
        </Row>
      </SettingsCard>

      {/* import dialog */}
      <SettingsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import backup"
        description="Review what will happen when importing backup.zip."
        footer={
          <>
            <SettingsButton onClick={() => setImportOpen(false)}>Cancel</SettingsButton>
            <SettingsButton
              variant={importPolicy === "replace-workspace" ? "destructive" : "primary"}
              disabled={importPolicy === "replace-workspace" && replacePhrase !== "replace my workspace"}
              onClick={() => setImportOpen(false)}
            >
              {importBtnLabel}
            </SettingsButton>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted-foreground">Source format</span>
            <SettingsSelect
              value={sourceFormat}
              onChange={setSourceFormat}
              ariaLabel="Source format"
              options={[
                { value: "auto", label: "Auto-detect" },
                { value: "skriuw", label: "Skriuw backup" },
                { value: "obsidian", label: "Obsidian vault (best effort)" },
                { value: "apple", label: "Apple Notes HTML (best effort)" },
                { value: "bear", label: "Bear export (best effort)" },
                { value: "notion", label: "Notion export (best effort)" },
                { value: "simplenote", label: "Simplenote export (best effort)" },
                { value: "markdown", label: "Markdown folder (best effort)" },
              ]}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted-foreground">Import policy</span>
            <SettingsSelect
              value={importPolicy}
              onChange={setImportPolicy}
              ariaLabel="Import policy"
              options={[
                { value: "merge", label: "Merge (skip duplicates)" },
                { value: "overwrite", label: "Overwrite matches" },
                { value: "duplicate", label: "Duplicate matches" },
                { value: "replace-workspace", label: "Replace workspace" },
              ]}
            />
          </label>
        </div>

        {importPolicy === "replace-workspace" && (
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] text-muted-foreground">
              {"To confirm workspace replace, type "}
              <span className="font-mono text-foreground">replace my workspace</span>
            </span>
            <SettingsInput
              value={replacePhrase}
              onChange={setReplacePhrase}
              placeholder="replace my workspace"
              className="w-full"
              ariaLabel="Confirm workspace replace"
            />
          </label>
        )}

        <div className="mt-3 rounded-md border border-[var(--border)]/50 bg-[var(--muted)]/30 p-3 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Preview: </span>
          14 notes to create · 3 to skip as duplicates · 2 folders · 5 journal entries
        </div>
      </SettingsDialog>

      <TypePhraseDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear all data"
        description="Permanently removes all notes, folders, journal entries, and tags. Your account and AI keys are kept. This cannot be undone."
        phrase="clear my data"
        confirmLabel="Clear all data"
        onConfirm={() => {}}
      />
    </div>
  )
}
