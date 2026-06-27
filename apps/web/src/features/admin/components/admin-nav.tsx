"use client";

import { ArrowLeft, FolderTree } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RawLogo } from "@/shared/icons/logo";
import { cn } from "@/shared/lib/utils";

type AdminNavItem = {
	href: string;
	label: string;
	icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const NAV_ITEMS: AdminNavItem[] = [
	{ href: "/admin/seed", label: "Seed bundles", icon: FolderTree },
];

export function AdminNav() {
	const pathname = usePathname();

	return (
		<nav className="flex h-full flex-col gap-1 p-3">
			<div className="mb-4 flex items-center gap-2 px-2">
				<RawLogo variant="sidebar" size={20} className="text-foreground" />
				<span className="text-[13px] font-medium tracking-tight text-foreground/85">
					Admin
				</span>
			</div>

			{NAV_ITEMS.map((item) => {
				const isActive = pathname?.startsWith(item.href);
				const Icon = item.icon;
				return (
					<Link
						key={item.href}
						href={item.href}
						className={cn(
							"flex h-7 items-center gap-2 rounded-md px-2 text-[13px] leading-none transition-colors",
							isActive
								? "bg-foreground/[0.06] text-foreground"
								: "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground",
						)}
					>
						<Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
						<span className="truncate">{item.label}</span>
					</Link>
				);
			})}

			<div className="mt-auto border-t border-border/40 pt-2">
				<Link
					href="/app"
					className="flex h-7 items-center gap-2 rounded-md px-2 text-[13px] leading-none text-muted-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
				>
					<ArrowLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
					<span className="truncate">Back to app</span>
				</Link>
			</div>
		</nav>
	);
}
