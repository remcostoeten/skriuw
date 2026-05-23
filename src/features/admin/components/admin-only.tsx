import type { ReactNode } from "react";

type Props = {
	isAdmin: boolean;
	children: ReactNode;
};

export function AdminOnly({ isAdmin, children }: Props) {
	if (!isAdmin) return null;
	return <>{children}</>;
}
