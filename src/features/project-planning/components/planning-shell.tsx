"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Menu, Plus, ChevronDown } from "lucide-react";
import { IconRail } from "@/features/layout/components/icon-rail";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import type { Feature, FeatureStatus } from "../types";

type Props = {
	features: Feature[];
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	isAdmin: boolean;
	isPending: boolean;
	onNewTopic: () => void;
	children: ReactNode;
};

const statusOrder: FeatureStatus[] = [
	"in_progress",
	"planned",
	"exploring",
	"blocked",
	"completed",
	"archived",
];

const statusLabel: Record<FeatureStatus, string> = {
	in_progress: "In progress",
	planned: "Planned",
	exploring: "Exploring",
	blocked: "Blocked",
	completed: "Completed",
	archived: "Archived",
};

export function PlanningShell({
	features,
	selectedId,
	onSelect,
	isAdmin,
	isPending,
	onNewTopic,
	children,
}: Props) {
	const router = useRouter();
	const [mobileOpen, setMobileOpen] = useState(false);
	const groups = statusOrder
		.map((status) => ({ status, items: features.filter((f) => f.status === status) }))
		.filter((g) => g.items.length > 0);

	const sidebarBody = (
		<SidebarBody
			groups={groups}
			featuresCount={features.length}
			selectedId={selectedId}
			onSelect={(id) => {
				onSelect(id);
				setMobileOpen(false);
			}}
			isAdmin={isAdmin}
			onNewTopic={() => {
				onNewTopic();
				setMobileOpen(false);
			}}
		/>
	);

	return (
		<div className="flex h-screen w-full bg-background text-foreground text-sm">
			<IconRail onOpenSettings={() => router.push("/app/settings")} />

			<aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
				{sidebarBody}
			</aside>

			<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
				<SheetContent side="left" className="w-80 border-r border-border bg-sidebar p-0">
					<SheetHeader className="border-b border-border px-3 py-2">
						<SheetTitle className="text-xs font-medium text-foreground">
							Planning
						</SheetTitle>
					</SheetHeader>
					{sidebarBody}
				</SheetContent>
			</Sheet>

			<main className="flex min-w-0 flex-1 flex-col bg-background">
				<header className="flex items-center justify-between border-b border-border bg-sidebar px-3 py-2">
					<div className="flex min-w-0 items-center gap-1">
						<button
							type="button"
							onClick={() => setMobileOpen(true)}
							aria-label="Open planning sidebar"
							className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground md:hidden"
						>
							<Menu className="h-4 w-4" />
						</button>
						<span className="truncate text-sm text-muted-foreground md:ml-1">
							Project Planning
						</span>
					</div>
					<div className="flex items-center gap-2">
						{isAdmin && (
							<span className="rounded border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
								Admin
							</span>
						)}
					</div>
				</header>

				<div
					className={`relative flex-1 overflow-y-auto transition-opacity duration-150 ${
						isPending ? "pointer-events-none opacity-60" : "opacity-100"
					}`}
					aria-busy={isPending}
				>
					{children}
				</div>
			</main>
		</div>
	);
}

type SidebarBodyProps = {
	groups: { status: FeatureStatus; items: Feature[] }[];
	featuresCount: number;
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	isAdmin: boolean;
	onNewTopic: () => void;
};

function SidebarBody({
	groups,
	featuresCount,
	selectedId,
	onSelect,
	isAdmin,
	onNewTopic,
}: SidebarBodyProps) {
	return (
		<>
			<div className="hidden items-center gap-1 border-b border-border px-2 py-2 md:flex">
				<div className="px-1 text-xs font-medium text-foreground">Planning</div>
				<div className="flex-1" />
				{isAdmin && (
					<button
						onClick={onNewTopic}
						className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
						aria-label="New topic"
					>
						<Plus className="h-4 w-4" />
					</button>
				)}
			</div>

			<div className="flex-1 space-y-4 overflow-y-auto px-2 py-2">
				<button
					type="button"
					onClick={() => onSelect(null)}
					aria-current={selectedId === null ? "page" : undefined}
					className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left ${
						selectedId === null ? "bg-accent text-foreground" : "hover:bg-accent/50"
					}`}
				>
					<span className="font-medium">Overview</span>
					<span className="text-xs text-muted-foreground">{featuresCount}</span>
				</button>

				{groups.map((g) => (
					<SidebarSection
						key={g.status}
						title={statusLabel[g.status].toUpperCase()}
						count={g.items.length}
					>
						<div className="space-y-0.5">
							{g.items.map((f) => (
								<button
									key={f.id}
									onClick={() => onSelect(f.id)}
									className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left ${
										selectedId === f.id
											? "bg-accent text-foreground"
											: "text-foreground/80 hover:bg-accent/50"
									}`}
								>
									<span
										className={`h-1.5 w-1.5 rounded-full ${statusDot(f.status)}`}
									/>
									<span className="truncate">{f.title}</span>
								</button>
							))}
						</div>
					</SidebarSection>
				))}
			</div>
		</>
	);
}

function statusDot(status: FeatureStatus): string {
	switch (status) {
		case "in_progress":
			return "bg-status-progress";
		case "planned":
			return "bg-status-planned";
		case "exploring":
			return "bg-status-exploring";
		case "blocked":
			return "bg-status-blocked";
		case "completed":
			return "bg-status-completed";
		case "archived":
			return "bg-muted-foreground";
	}
}

function SidebarSection({
	title,
	count,
	children,
}: {
	title: string;
	count: number;
	children: ReactNode;
}) {
	return (
		<div>
			<div className="mb-2 flex items-center justify-between px-2">
				<div className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-muted-foreground">
					<ChevronDown className="h-3 w-3" /> {title}
				</div>
				<span className="text-[10px] text-muted-foreground">{count}</span>
			</div>
			{children}
		</div>
	);
}
