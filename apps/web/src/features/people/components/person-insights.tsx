"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Users, Waypoints } from "lucide-react";
import { NOTE_PROPERTY_COLORS } from "@/domain/notes/properties";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { NotesEmptyState } from "@/features/notes/components/notes-empty-state";
import { AnimatedRelativeTime } from "@/shared/ui/animated-relative-time";
import { Button } from "@/shared/ui/button";
import { useWorkspacePeople } from "../hooks/use-people";
import { usePersonNotes } from "../hooks/use-people-management";

type Props = {
	personId: string;
};

export function PersonInsights({ personId }: Props) {
	const router = useRouter();
	const { data: people = [] } = useWorkspacePeople();
	const { data: notes = [], isLoading } = usePersonNotes(personId);
	const person = people.find((entry) => entry.id === personId);
	const dot = person?.color ? NOTE_PROPERTY_COLORS[person.color].dot : undefined;

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<IconRail />
				<div className="mx-auto flex h-full w-full max-w-3xl flex-col">
					<header className="border-b border-border px-6 py-5">
						<div className="flex items-center gap-2">
							<Button variant="ghost" size="sm" asChild>
								<Link href="/app/people" aria-label="Back to people">
									<ArrowLeft className="h-4 w-4" />
								</Link>
							</Button>
							<span
								aria-hidden="true"
								className="size-2.5 shrink-0 rounded-full"
								style={{ backgroundColor: dot ?? "var(--muted-foreground)" }}
							/>
							<h1 className="text-base font-semibold text-foreground">
								{person?.name ?? "Unknown person"}
							</h1>
							<span className="text-sm text-muted-foreground">
								{notes.length === 1 ? "mentioned in 1 note" : `mentioned in ${notes.length} notes`}
							</span>
							<div className="ml-auto">
								<Button variant="outline" size="sm" asChild>
									<Link href="/app/graph">
										<Waypoints className="mr-1.5 h-3.5 w-3.5" />
										Show in graph
									</Link>
								</Button>
							</div>
						</div>
					</header>

					{isLoading ? null : notes.length === 0 ? (
						<NotesEmptyState
							icon={Users}
							title={`No mentions of ${person?.name ?? "this person"}`}
							description="Notes that mention them with $ or list them in a person field show up here."
						/>
					) : (
						<ul className="flex-1 divide-y divide-border overflow-y-auto">
							{notes.map((note) => (
								<li key={note.id}>
									<Link
										href={`/app?note=${note.id}`}
										className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
									>
										<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium text-foreground">
												{note.name.replace(/\.md$/, "")}
											</p>
											<p className="text-xs text-muted-foreground">
												Edited{" "}
												<AnimatedRelativeTime
													date={note.modifiedAt}
													animate={false}
													suffix=" ago"
												/>
											</p>
										</div>
									</Link>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</LayoutContainer>
	);
}
