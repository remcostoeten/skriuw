import { redirect } from "next/navigation";
import { getServerUser } from "@/core/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	const { user } = await getServerUser();
	if (!user) {
		redirect("/sign-in");
	}

	return children;
}
