import type { ReactNode } from "react";
import { AdminNav } from "./admin-nav";

type Props = {
	children: ReactNode;
};

export function AdminShell({ children }: Props) {
	return (
		<div className="flex h-dvh">
			<aside className="w-56 shrink-0 border-r border-border/40 bg-muted/15">
				<AdminNav />
			</aside>
			<main className="flex-1 overflow-auto">{children}</main>
		</div>
	);
}
