import { useSyncExternalStore } from "react";
import { getAuthStateSnapshot, subscribeAuthState } from "@/src/platform/auth";

export function useAuthSnapshot() {
  return useSyncExternalStore(subscribeAuthState, getAuthStateSnapshot, getAuthStateSnapshot);
}
