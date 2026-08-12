import { PanelTopClose, Search, UnfoldVertical } from "lucide-react";
import { DESKTOP_SIDEBAR_MIN_WIDTH } from "@/features/notes/constants";
import { NewFolderNoteIcon, NewNoteIcon } from "@/features/notes/components/sidebar/header-icons";
import { NotesSidebarContentSkeleton } from "./sidebar-tree-skeleton";

function SidebarHeaderIcon({ children }: { children: React.ReactNode }) {
	return (
		<div
			aria-hidden="true"
			className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground"
		>
			{children}
		</div>
	);
}

export function NotesSidebarSkeleton() {
	return (
		<div
			aria-busy="true"
			aria-label="Loading notes sidebar"
			className="hidden shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col"
			style={{ width: DESKTOP_SIDEBAR_MIN_WIDTH, minWidth: DESKTOP_SIDEBAR_MIN_WIDTH }}
		>
			<div className="sticky top-0 z-10 flex h-11 items-center justify-between overflow-hidden border-b border-sidebar-border bg-sidebar px-3">
				<div className="flex h-full w-full items-center justify-between gap-3">
					<div className="flex w-full items-center justify-between gap-2 md:gap-2.5">
						<SidebarHeaderIcon>
							<NewNoteIcon />
						</SidebarHeaderIcon>
						<SidebarHeaderIcon>
							<NewFolderNoteIcon />
						</SidebarHeaderIcon>
						<SidebarHeaderIcon>
							<PanelTopClose className="h-4 w-4" strokeWidth={1.5} />
						</SidebarHeaderIcon>
						<SidebarHeaderIcon>
							<UnfoldVertical className="h-4 w-4" strokeWidth={1.5} />
						</SidebarHeaderIcon>
						<SidebarHeaderIcon>
							<Search className="h-4 w-4" strokeWidth={1.5} />
						</SidebarHeaderIcon>
					</div>
				</div>
			</div>
			<NotesSidebarContentSkeleton />
		</div>
	);
}
