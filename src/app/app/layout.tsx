import { getServerUser } from "@/core/supabase/server-client";
import { ensureCloudStarterContentSeeded } from "@/domain/seed/api";
import { AppProviders } from "@/providers/app-providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getServerUser();

  if (user) {
    await ensureCloudStarterContentSeeded(user.id);
  }

  return <AppProviders>{children}</AppProviders>;
}
