import { redirect } from "next/navigation";
import { getServerUser } from "@/core/supabase/server-client";
import { ensureCloudStarterContentSeeded } from "@/domain/seed/api";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getServerUser();
  if (!user) {
    redirect("/sign-in");
  }

  await ensureCloudStarterContentSeeded(user.id);

  return <>{children}</>;
}
