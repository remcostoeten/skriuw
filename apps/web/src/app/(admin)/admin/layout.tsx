import type { ReactNode } from "react";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { requireAdmin } from "@/features/admin/guards/require-admin";

export const instant = false;

export default async function AdminLayout({ children }: { children: ReactNode }) {
	await requireAdmin();
	return <AdminShell>{children}</AdminShell>;
}
