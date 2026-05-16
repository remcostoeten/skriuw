"use client";

import { Switch } from "@/shared/ui/switch";
import { usePreferencesStore } from "@/features/settings/store";
import { SectionHeader, Row, SettingsCard } from "@/features/settings/components/settings-primitives";

export function NotificationsSection() {
  const notifications = usePreferencesStore((s) => s.notifications);
  const update = usePreferencesStore((s) => s.updateNotificationsPreference);

  return (
    <>
      <SectionHeader
        title="Notifications"
        description="Decide when Skriuw should reach out."
      />
      <SettingsCard>
        <Row title="Daily journal reminder" description="A nudge each morning at 9:00.">
          <Switch
            checked={notifications.dailyReminder}
            onCheckedChange={(v) => update("dailyReminder", v)}
          />
        </Row>
        <Row title="Weekly review" description="Sunday digest of last week's notes.">
          <Switch
            checked={notifications.weeklyReview}
            onCheckedChange={(v) => update("weeklyReview", v)}
          />
        </Row>
        <Row
          title="Mentions"
          description="When someone @mentions you in a note."
          disabled
        >
          <Switch
            checked={notifications.mentions}
            disabled
            title="Mentions are not yet available"
          />
        </Row>
        <Row
          title="Email summaries"
          description="Send the digest to your inbox too."
          disabled
        >
          <Switch
            checked={notifications.emailSummaries}
            disabled
            title="Email summaries are not yet available"
          />
        </Row>
      </SettingsCard>
    </>
  );
}
