"use client";

import Link from "next/link";
import { ArrowLeft, FileText, Hash, NotebookPen, Waypoints } from "lucide-react";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { NotesEmptyState } from "@/features/notes/components/notes-empty-state";
import { AnimatedRelativeTime } from "@/shared/ui/animated-relative-time";
import { Button } from "@/shared/ui/button";
import { useBackspaceNavigatesBack } from "@/shared/hooks/use-backspace-navigates-back";
import { useSetTagColor, useTagNotes, useWorkspaceTagSummaries } from "../hooks/use-tags";
import { ColorSwatchPicker } from "./color-swatch-picker";

type Props = {
	name: string;
};

export function TagInsights({ name }: Props) {
	useBackspaceNavigatesBack();
	const { data: notes = [], isPending } = useTagNotes(name);
	const { data: tags = [] } = useWorkspaceTagSummaries();
	const setTagColor = useSetTagColor();
	const summary = tags.find((tag) => tag.name === name);

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<div className="mx-auto flex h-full w-full max-w-3xl flex-col">
					<header className="border-b border-border px-6 py-5">
						<div className="flex items-center gap-2">
							<Button variant="ghost" size="sm" asChild>
								<Link href="/app/tags" aria-label="Back to tags">
									<ArrowLeft className="h-4 w-4" />
								</Link>
							</Button>
							<ColorSwatchPicker
								value={summary?.color ?? null}
								label={`#${name}`}
								onChange={(color) => setTagColor.mutate({ name, color })}
							/>
							<h1 className="text-base font-semibold text-foreground">#{name}</h1>
							<span className="text-sm text-muted-foreground">
								{notes.length === 1 ? "1 note" : `${notes.length} notes`}
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

					{isPending ? null : notes.length === 0 ? (
						<NotesEmptyState
							icon={Hash}
							title={`Nothing tagged #${name}`}
							description="Notes carrying this tag will show up here."
						/>
					) : (
						<ul className="flex-1 divide-y divide-border overflow-y-auto">
							{notes.map((note) => {
								const isJournal = note.kind === "journal";
								const href = isJournal
									? `/app/journal?date=${encodeURIComponent(note.dateKey ?? "")}`
									: `/app?note=${note.id}`;
								const Icon = isJournal ? NotebookPen : FileText;
								return (
									<li key={`${note.kind ?? "note"}:${note.id}`}>
										<Link
											href={href}
											className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
										>
											<Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium text-foreground">
													{note.name.replace(/\.md$/, "")}
													{isJournal ? (
														<span className="ml-2 text-xs font-normal text-muted-foreground">
															Journal
														</span>
													) : null}
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
								);
							})}
						</ul>
					)}
				</div>
			</div>
		</LayoutContainer>
	);
}
