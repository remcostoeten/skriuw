import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Iridescence } from "@/shared/ui/iridescence";
import { RawLogo } from "@/shared/ui/logo";
import { Button } from "@/shared/ui/button-component";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex h-dvh">
			<div className="relative hidden flex-col items-start justify-between overflow-hidden p-12 md:flex md:w-1/2">
				<div className="absolute inset-0">
					<Iridescence
						amplitude={0.1}
						color={[0.1, 0.1, 0.1]}
						mouseReact={false}
						speed={0.5}
						className="h-full w-full"
					/>
				</div>
				<Link className="relative z-10" href="https://skriuw.app">
					<Button
						className="group px-0! text-white/50 hover:bg-transparent hover:text-white/80"
						variant="ghost"
					>
						<ArrowLeft className="size-4 transition-transform duration-200 group-hover:translate-x-[-4px]" />
						Back
					</Button>
				</Link>
				<div className="relative z-10">
					<h1 className="mb-2 w-full max-w-sm font-serif text-4xl font-medium leading-[46px] text-white/60">
						Keep your <span className="text-white">notes and journal</span> in sync with <span className="font-serif">Skriuw</span>
					</h1>
					<p className="max-w-sm text-white/90">
						Continue writing on web, review your journal over time, and carry the same workspace across every device you use.
					</p>
				</div>
			</div>
			<div className="flex w-full flex-col overflow-auto bg-background md:w-1/2">
				<div className="flex justify-center p-6 pt-8 md:p-8 md:pt-20">
					<RawLogo variant="sidebar" size={40} className="text-foreground" />
				</div>

				<div className="flex flex-1 items-center justify-center md:p-8 md:pt-0">
					<div className="w-full max-w-md">
						{children}
					</div>
				</div>

				<div className="flex justify-center p-6 pb-8 text-center text-xs text-muted-foreground">
					<p>Powered by Skriuw</p>
				</div>
			</div>
		</div>
	);
}