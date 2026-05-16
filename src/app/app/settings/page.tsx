import { Suspense } from "react";
import { SettingsPage } from "@/features/settings/components/settings-page";

export default function SettingsRoute() {
  return (
    <Suspense fallback={null}>
      <SettingsPage />
    </Suspense>
  );
}
