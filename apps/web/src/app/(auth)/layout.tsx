import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { RawLogo } from "@/shared/icons/logo";
import { Button } from "@/shared/ui/button";
import { getServerUser } from "@/core/db";
import { AuthHeroCopy } from "@/features/auth/components/auth-hero-copy";
import { ContinueAsGuestLink } from "@/features/auth/components/continue-as-guest-link";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
	const { user } = await getServerUser();
	if (user) {
		redirect("/app");
	}
	return (
		<div className="flex h-dvh">
			<div className="relative hidden flex-col items-start justify-between overflow-hidden p-12 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700 md:flex md:w-1/2">
				<div
					aria-hidden="true"
					className="absolute inset-0 pointer-events-none opacity-90"
					style={{
						background:
							"radial-gradient(circle at 32% 52%, hsl(var(--project-purple) / 0.26) 0, transparent 42%), radial-gradient(circle at 78% 24%, hsl(var(--foreground) / 0.05) 0, transparent 28%), linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--background-secondary)) 100%)",
					}}
				/>
				<div
					aria-hidden="true"
					className="absolute inset-0 pointer-events-none opacity-[0.18]"
					style={{
						backgroundImage:
							"radial-gradient(circle, hsl(var(--project-purple) / 0.7) 0 1px, transparent 1.2px)",
						backgroundPosition: "1rem 1rem",
						backgroundSize: "6px 6px",
						maskImage:
							"radial-gradient(ellipse at 32% 52%, black 0 36%, hsl(var(--scrim) / 0.7) 48%, transparent 70%)",
					}}
				/>
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
			<div className="flex w-full flex-col overflow-auto pt-[env(safe-area-inset-top)] md:w-1/2 md:pt-0">
				<div className="flex flex-1 items-center justify-center px-0 py-8 md:p-8">
					<div className="w-full max-w-md">
						<div className="mb-6 flex justify-start px-6">
							<RawLogo variant="sidebar" size={32} className="text-foreground" />
						</div>
						{children}
						<ContinueAsGuestLink />
					</div>
				</div>
			</div>
		</div>
	);
}
