"use client"

import { useState } from "react"
import { KeyRound, Laptop, LogOut, Smartphone } from "lucide-react"
import { AnimatedList } from "../animated-list"
import {
  GroupLabel,
  Row,
  SectionHeader,
  SettingsButton,
  SettingsCard,
  SettingsDialog,
  SettingsInput,
  Toggle,
} from "../primitives"

const SESSIONS = [
  { id: "s1", device: "MacBook Pro", location: "Leeuwarden, NL", lastActive: "Active now", current: true, icon: <Laptop className="h-4 w-4" /> },
  { id: "s2", device: "iPhone 16", location: "Leeuwarden, NL", lastActive: "2 hours ago", current: false, icon: <Smartphone className="h-4 w-4" /> },
  { id: "s3", device: "Windows Desktop", location: "Groningen, NL", lastActive: "6 days ago", current: false, icon: <Laptop className="h-4 w-4" /> },
]

export function SecuritySection() {
  const [twoFactor, setTwoFactor] = useState(false)
  const [changeOpen, setChangeOpen] = useState(false)
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [sessions, setSessions] = useState(SESSIONS)

  const canSubmit = current.length > 0 && next.length >= 8 && next === confirm

  return (
    <div>
      <SectionHeader title="Security" description="Password, two-factor authentication, and active sessions." />

      <GroupLabel>Sign-in</GroupLabel>
      <SettingsCard>
        <Row title="Password" description="Last changed 3 months ago.">
          <SettingsButton icon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => setChangeOpen(true)}>
            Change password
          </SettingsButton>
        </Row>
        <Row
          title="Two-factor authentication"
          description="Require a one-time code from an authenticator app when signing in."
        >
          <Toggle checked={twoFactor} onChange={setTwoFactor} label="Two-factor authentication" />
        </Row>
      </SettingsCard>

      <GroupLabel>Active sessions</GroupLabel>
      <SettingsCard>
        <AnimatedList
          items={sessions}
          className="divide-y divide-[var(--border)]/50"
          renderItem={(session) => (
            <Row
              title={session.current ? `${session.device} (this device)` : session.device}
              description={`${session.location} · ${session.lastActive}`}
            >
              {!session.current && (
                <SettingsButton
                  variant="destructive"
                  icon={<LogOut className="h-3.5 w-3.5" />}
                  onClick={() => setSessions((s) => s.filter((x) => x.id !== session.id))}
                >
                  Revoke
                </SettingsButton>
              )}
            </Row>
          )}
        />
      </SettingsCard>

      <SettingsDialog
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        title="Change password"
        description="Use at least 8 characters. You will stay signed in on this device."
        footer={
          <>
            <SettingsButton onClick={() => setChangeOpen(false)}>Cancel</SettingsButton>
            <SettingsButton
              variant="primary"
              disabled={!canSubmit}
              onClick={() => {
                setChangeOpen(false)
                setCurrent("")
                setNext("")
                setConfirm("")
              }}
            >
              Update password
            </SettingsButton>
          </>
        }
      >
        <div className="flex flex-col gap-2.5">
          <SettingsInput
            type="password"
            value={current}
            onChange={setCurrent}
            placeholder="Current password"
            ariaLabel="Current password"
            className="w-full"
          />
          <SettingsInput
            type="password"
            value={next}
            onChange={setNext}
            placeholder="New password"
            ariaLabel="New password"
            className="w-full"
          />
          <SettingsInput
            type="password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Confirm new password"
            ariaLabel="Confirm new password"
            className="w-full"
          />
        </div>
      </SettingsDialog>
    </div>
  )
}
