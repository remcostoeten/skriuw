"use client";

import { useSyncExternalStore } from "react";
import { getAuthStateSnapshot, subscribeAuthState } from "@/platform/auth";

export function useAuthSnapshot() {
  return useSyncExternalStore(subscribeAuthState, getAuthStateSnapshot, getAuthStateSnapshot);
}
