import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { RawLogo } from "@/shared/icons/logo";
import { Button } from "@/shared/ui/button";
import { getServerUser } from "@/core/supabase/server-client";
import { AuthVisual } from "@/features/auth/components/auth-visual";
import { AuthHeroCopy } from "@/features/auth/components/auth-hero-copy";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
	const { user } = await getServerUser();
	if (user) {
		redirect("/app");
	}
	return (
		<div className="flex h-dvh">
			<div className="relative hidden flex-col items-start justify-between overflow-hidden p-12 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700 md:flex md:w-1/2">
				<div className="absolute inset-0 pointer-events-none">
					<AuthVisual />
				</div>
				<Button
					link="/"
					className="group cursor-pointer px-0! text-foreground/50 hover:bg-transparent hover:text-foreground/80"
					variant="ghost"
				>
					<ArrowLeft className="size-4 transition-transform duration-200 group-hover:translate-x-[-4px]" />
					Back
				</Button>
				<div className="relative z-10">
					<AuthHeroCopy />
				</div>
			</div>
			<div className="flex w-full flex-col overflow-auto md:w-1/2">
				<div className="flex flex-1 items-center justify-center px-0 py-8 md:p-8">
					<div className="w-full max-w-md">
						<div className="mb-6 flex justify-start px-6">
							<RawLogo variant="sidebar" size={32} className="text-foreground" />
						</div>
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}
