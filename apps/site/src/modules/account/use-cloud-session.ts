"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { cloudUrl } from "@/data/cloud";

export type CloudAccount = {
  name: string;
  email: string;
};

export type CloudSession =
  | { status: "signed-out" }
  | { status: "signed-in"; account: CloudAccount | null };

const SESSION_STORAGE_KEY = "skriuw.cloud-session.v1";

const storedSession = z.object({ version: z.literal(1), token: z.string().min(1) });
const sessionResponse = z
  .object({ user: z.object({ name: z.string(), email: z.string() }) })
  .nullable();

const signedOut: CloudSession = { status: "signed-out" };

function parseToken(raw: string | null) {
  if (raw === null) return null;
  try {
    const parsed = storedSession.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.token : null;
  } catch {
    return null;
  }
}

function readStoredToken() {
  try {
    return parseToken(localStorage.getItem(SESSION_STORAGE_KEY));
  } catch {
    return null;
  }
}

function subscribeToStorage(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === null || event.key === SESSION_STORAGE_KEY) onChange();
  }
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function serverToken() {
  return null;
}

async function fetchAccount(token: string, signal: AbortSignal) {
  const response = await fetch(
    `${cloudUrl(process.env.NEXT_PUBLIC_SKRIUW_CLOUD_URL)}/api/auth/get-session`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal,
    },
  );
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Session request failed with ${response.status}`);
  const body = sessionResponse.parse(await response.json());
  return body === null ? null : { name: body.user.name, email: body.user.email };
}

type Verification = {
  token: string;
  account: CloudAccount | null;
  rejected: boolean;
};

/**
 * @name useCloudSession
 * @description Reads the Skriuw cloud session that the workspace at `/app/`
 * keeps in localStorage on the same origin, then asks the cloud service who it
 * belongs to. The server render and the first client render are always
 * signed out, so the static header never shifts for signed-out visitors. A
 * token the cloud rejects reads as signed out; a network failure keeps the
 * signed-in state without account details.
 *
 * @example
 * const session = useCloudSession();
 * if (session.status === "signed-in") showAccountMenu(session.account);
 */
export function useCloudSession(): CloudSession {
  const token = useSyncExternalStore(subscribeToStorage, readStoredToken, serverToken);
  const [verification, setVerification] = useState<Verification | null>(null);

  useEffect(() => {
    if (token === null) return;
    const controller = new AbortController();
    fetchAccount(token, controller.signal).then(
      (account) => setVerification({ token, account, rejected: account === null }),
      (error: Error) => {
        if (controller.signal.aborted) return;
        console.warn("Skriuw cloud session lookup failed", error);
        setVerification({ token, account: null, rejected: false });
      },
    );
    return () => controller.abort();
  }, [token]);

  if (token === null) return signedOut;
  const current = verification?.token === token ? verification : null;
  if (current?.rejected) return signedOut;
  return { status: "signed-in", account: current?.account ?? null };
}
