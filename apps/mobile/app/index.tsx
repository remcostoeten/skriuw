import { type Href, Redirect } from "expo-router";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { useAuthSnapshot } from "@/src/platform/auth/use-auth";

type MobileAuthSnapshot = {
  phase: "initializing" | "signed_out" | "authenticated";
  isReady: boolean;
};

export default function IndexScreen() {
  const auth = useAuthSnapshot() as MobileAuthSnapshot;

  if (!auth.isReady) {
    return <LoadingScreen />;
  }

  return <Redirect href={(auth.phase === "authenticated" ? "/notes" : "/sign-in") as Href} />;
}
