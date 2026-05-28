import { redirect } from "next/navigation";
import { getServerUser } from "@/core/db";
import { WorkspaceModeBanner } from "@/features/layout/components/workspace-mode-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	const { user } = await getServerUser();
	if (!user) {
		redirect("/sign-in");
	}

	return (
		<>
			<WorkspaceModeBanner />
			{children}
		</>
	);
}
