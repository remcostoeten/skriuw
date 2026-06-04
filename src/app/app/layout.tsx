import { getServerUser } from "@/core/db";
import { GuestBanner } from "@/features/layout/components/guest-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	const { user } = await getServerUser();

	return (
		<>
			{!user && <GuestBanner />}
			{children}
		</>
	);
}
