"use client";

import dynamic from "next/dynamic";

// @remcostoeten/auth-drawer is the single largest chunk on /app; every trigger
// that opens the drawer is an effect or window event, so nothing needs it in
// the first paint. ssr:false keeps it out of the critical path entirely.
export const AuthDrawerHost = dynamic(
	() => import("./auth-drawer-host").then((mod) => mod.AuthDrawerHost),
	{ ssr: false },
);
