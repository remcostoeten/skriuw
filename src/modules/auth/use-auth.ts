"use client";

import { useSyncExternalStore } from "react";
import { getAuthStateSnapshot, subscribeAuthState } from "@/modules/auth";

export function useAuthSnapshot() {
  return useSyncExternalStore(subscribeAuthState, getAuthStateSnapshot, getAuthStateSnapshot);
}
