/**
 * Desktop SPA stub for `@/core/workspace-backend/server-backend`. The real
 * module statically imports every `"use server"` action (notes, folders,
 * journal), which would drag the entire server/Prisma action graph into the
 * desktop bundle. The desktop app only ever uses the Tauri backend, so this
 * stub keeps that server code out of the bundle entirely. It is import-safe;
 * any actual access throws (the SPA never selects the "server" backend).
 */
function unavailable(): never {
	throw new Error("server backend is unavailable in the desktop SPA (uses the Tauri backend)");
}

export const serverBackend = new Proxy(
	{},
	{
		get: unavailable,
		apply: unavailable,
	},
) as never;
