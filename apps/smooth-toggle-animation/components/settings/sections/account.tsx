"use client"

import { useEffect, useState } from "react"
import { Check, LogOut, Share2, X as XIcon } from "lucide-react"
import {
  GroupLabel,
  Row,
  SectionHeader,
  SettingsButton,
  SettingsCard,
  SettingsInput,
  TypePhraseDialog,
} from "../primitives"

export function AccountSection() {
  const [displayName, setDisplayName] = useState("Skriuw User")
  const [savedName, setSavedName] = useState("Skriuw User")
  const [savingName, setSavingName] = useState(false)

  const [username, setUsername] = useState("")
  const [availability, setAvailability] = useState<"available" | "taken" | null>(null)
  const [savedUsername, setSavedUsername] = useState("")

  const [signingOut, setSigningOut] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // 400ms debounced availability check (mock: names containing "taken" are unavailable)
  useEffect(() => {
    if (!username.trim() || username === savedUsername) {
      setAvailability(null)
      return
    }
    const valid = /^[a-zA-Z0-9_.]+$/.test(username)
    const t = setTimeout(() => {
      setAvailability(valid && !username.toLowerCase().includes("taken") ? "available" : "taken")
    }, 400)
    return () => clearTimeout(t)
  }, [username, savedUsername])

  function saveName() {
    if (displayName === savedName) return
    setSavingName(true)
    setTimeout(() => {
      setSavedName(displayName)
      setSavingName(false)
    }, 500)
  }

  const nameDirty = displayName !== savedName
  const usernameDirty = username !== savedUsername && username.trim().length > 0

  return (
    <div>
      <SectionHeader title="Account" description="How you appear in Skriuw and where notes are tied." />

      {/* avatar preview */}
      <div className="flex items-center gap-4 rounded-lg border border-[var(--border)]/60 bg-[var(--card)]/40 p-4">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/20 text-lg font-semibold text-[var(--primary)]"
        >
          {savedName
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{savedName}</div>
          <div className="truncate text-xs text-muted-foreground">user@skriuw.com</div>
        </div>
      </div>

      <GroupLabel>Profile</GroupLabel>
      <SettingsCard>
        <Row title="Display name" description="Shown on shared notes and comments.">
          <div className="flex items-center gap-2">
            {nameDirty && (
              <SettingsButton onClick={saveName} disabled={savingName}>
                {savingName ? "Saving…" : "Save"}
              </SettingsButton>
            )}
            <SettingsInput
              value={displayName}
              onChange={setDisplayName}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName()
              }}
              className="w-52"
              ariaLabel="Display name"
            />
          </div>
        </Row>
        <Row
          title="Username"
          description="Used for collaboration invites. Letters, numbers, underscores, and dots only."
        >
          <div className="flex items-center gap-2">
            {usernameDirty && availability === "available" && (
              <SettingsButton onClick={() => setSavedUsername(username)}>Save</SettingsButton>
            )}
            <div className="relative">
              <SettingsInput
                value={username}
                onChange={setUsername}
                placeholder="your-handle"
                maxLength={30}
                className="w-52 pr-6"
                ariaLabel="Username"
              />
              {availability === "available" && (
                <Check aria-label="Username available" className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--success)]" />
              )}
              {availability === "taken" && (
                <XIcon aria-label="Username unavailable" className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--destructive)]" />
              )}
            </div>
          </div>
        </Row>
        <Row title="Email" description="Used for sign-in and account recovery.">
          <SettingsInput
            value="user@skriuw.com"
            readOnly
            className="w-52"
            title="Email changes require re-authentication — contact support"
            ariaLabel="Email"
          />
        </Row>
      </SettingsCard>

      <GroupLabel>Sharing</GroupLabel>
      <SettingsCard>
        <Row title="Shared notes" description="Manage every public link and see view activity.">
          <SettingsButton icon={<Share2 className="h-3.5 w-3.5" />}>Open overview</SettingsButton>
        </Row>
      </SettingsCard>

      <GroupLabel>Danger zone</GroupLabel>
      <SettingsCard>
        <Row title="Sign out" description="End your session on this device.">
          <SettingsButton
            icon={<LogOut className="h-3.5 w-3.5" />}
            onClick={() => {
              setSigningOut(true)
              setTimeout(() => setSigningOut(false), 800)
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </SettingsButton>
        </Row>
        <Row title="Delete account" description="Permanently remove your account and notes.">
          <SettingsButton variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete
          </SettingsButton>
        </Row>
      </SettingsCard>

      <TypePhraseDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete account"
        description="This will permanently remove your account, notes, and history. This cannot be undone."
        phrase="delete my account"
        confirmLabel="Delete account"
        onConfirm={() => {}}
      />
    </div>
  )
}
