"use client"

import { useState } from "react"
import { GroupLabel, Row, SectionHeader, SettingsCard, Toggle } from "../primitives"

export function PrivacySection() {
  const [analytics, setAnalytics] = useState(true)

  return (
    <div>
      <SectionHeader title="Privacy" description="Control what Skriuw sends outside your workspace." />

      <GroupLabel>Analytics</GroupLabel>
      <SettingsCard>
        <Row
          title="Usage analytics"
          description="Anonymous page views and product events while you browse. On by default for accounts — turn off to opt out. No note content, no cookies. Sign-in events are recorded separately on the server."
        >
          <Toggle checked={analytics} onChange={setAnalytics} label="Usage analytics" />
        </Row>
      </SettingsCard>
    </div>
  )
}
