"use client";

import { createBetterAuthAdapter } from "@remcostoeten/auth-drawer/adapters/better-auth";
import { authClient } from "@/lib/auth-client";

export const authDrawerAdapter = createBetterAuthAdapter({ client: authClient });
