import { redirect } from "next/navigation";
import { getServerUser } from "@/core/supabase/server-client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getServerUser();
  if (!user) {
    redirect("/sign-in");
  }
  return <>{children}</>;
}
