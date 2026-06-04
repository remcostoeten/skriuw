"use client";

type ProtectedAppGuardProps = {
	children: React.ReactNode;
};

/**
 * No-op passthrough. Route protection now lives in src/proxy.ts and the
 * server layout; /app is reachable as a guest workspace, so this component
 * intentionally does not redirect on a missing session.
 */
export function ProtectedAppGuard({ children }: ProtectedAppGuardProps) {
	return <>{children}</>;
}
