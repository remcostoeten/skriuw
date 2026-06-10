import { BookOpen, Kanban, Settings, Waypoints } from "lucide-react";
import { FolderOpenIcon } from "@/shared/icons/folder-open";
import { RawLogo } from "@/shared/icons/logo";
import { cn } from "@/shared/lib/utils";

const iconButtonClass =
	"flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-sidebar-foreground/52";

type IconRailSkeletonProps = {
	activeHref?: "/app" | "/app/journal" | "/project-planning";
};

export function IconRailSkeleton({ activeHref = "/app" }: IconRailSkeletonProps) {
	return (
		<>
			<aside
				aria-hidden
				className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col items-center justify-between border-r border-sidebar-border bg-sidebar/95 backdrop-blur supports-[backdrop-filter]:bg-sidebar/85 md:flex"
			>
				<div className="flex w-full flex-col items-center">
					<div className="flex h-11 w-full items-center justify-center border-b border-sidebar-border">
						<div className="rounded-2xl border border-transparent p-1.5">
							<RawLogo variant="sidebar" size={26} className="text-sidebar-foreground/92" />
						</div>
					</div>
					<div className="mt-4 flex w-full flex-col items-center gap-4">
						<div
							className={cn(
								iconButtonClass,
								activeHref === "/app" &&
									"bg-sidebar-accent/75 text-sidebar-accent-foreground",
							)}
						>
							<FolderOpenIcon
								size={18}
								className={
									activeHref === "/app"
										? "text-sidebar-accent-foreground"
										: "text-sidebar-foreground/52"
								}
							/>
						</div>
						<div
							className={cn(
								iconButtonClass,
								activeHref === "/app/journal" &&
									"bg-sidebar-accent/75 text-sidebar-accent-foreground",
							)}
						>
							<BookOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
						</div>
						<div className={iconButtonClass}>
							<Waypoints className="h-[18px] w-[18px]" strokeWidth={1.6} />
						</div>
					</div>
				</div>
				<div className="flex w-full flex-col items-center gap-3 pb-4">
					<div
						className={cn(
							iconButtonClass,
							activeHref === "/project-planning" &&
								"bg-sidebar-accent/75 text-sidebar-accent-foreground",
						)}
					>
						<Kanban className="h-[18px] w-[18px]" strokeWidth={1.6} />
					</div>
					<div className="h-px w-8 bg-sidebar-border" />
					<div className={iconButtonClass}>
						<Settings className="h-[18px] w-[18px]" strokeWidth={1.6} />
					</div>
					<div className="h-9 w-9 rounded-full border border-sidebar-border bg-sidebar" />
				</div>
			</aside>
			<div aria-hidden className="hidden w-14 shrink-0 md:block" />
		</>
	);
}
