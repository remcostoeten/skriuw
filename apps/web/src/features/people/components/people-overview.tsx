"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2, Merge, Users } from "lucide-react";
import type { Person } from "@/domain/people/models";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { NotesEmptyState } from "@/features/notes/components/notes-empty-state";
import { ColorSwatchPicker } from "@/features/tags/components/color-swatch-picker";
import { Button } from "@/shared/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import { useWorkspacePeople } from "../hooks/use-people";
import { useDeletePerson, useMergePersons, useUpdatePerson } from "../hooks/use-people-management";

type PendingAction =
	| { kind: "rename"; person: Person }
	| { kind: "merge"; person: Person }
	| { kind: "delete"; person: Person };

export function PeopleOverview() {
	const { data: people = [], isLoading } = useWorkspacePeople();
	const updatePerson = useUpdatePerson();
	const deletePerson = useDeletePerson();
	const mergePersons = useMergePersons();
	const [pending, setPending] = useState<PendingAction | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [mergeTargetId, setMergeTargetId] = useState("");

	function submitRename() {
		if (pending?.kind !== "rename") return;
		const next = renameValue.trim();
		if (next && next !== pending.person.name) {
			updatePerson.mutate({ id: pending.person.id, name: next });
		}
		setPending(null);
	}

	function submitMerge() {
		if (pending?.kind !== "merge" || !mergeTargetId) return;
		const target = people.find((person) => person.id === mergeTargetId);
		if (target) {
			mergePersons.mutate({ source: pending.person, target });
		}
		setPending(null);
	}

	function submitDelete() {
		if (pending?.kind !== "delete") return;
		deletePerson.mutate(pending.person);
		setPending(null);
	}

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<IconRail />
				<div className="mx-auto flex h-full w-full max-w-3xl flex-col">
					<header className="border-b border-border px-6 py-5">
						<h1 className="text-base font-semibold text-foreground">People</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Everyone you've mentioned with $. Renames update every mention
							instantly; merges and deletes rewrite the notes involved.
						</p>
					</header>

					{isLoading ? null : people.length === 0 ? (
						<NotesEmptyState
							icon={Users}
							title="No people yet"
							description="Type $ in a note to mention someone. People collect here automatically."
						/>
					) : (
						<ul className="flex-1 divide-y divide-border overflow-y-auto">
							{people.map((person) => (
								<li key={person.id} className="flex items-center gap-3 px-6 py-3">
									<ColorSwatchPicker
										value={person.color}
										label={person.name}
										onChange={(color) =>
											updatePerson.mutate({ id: person.id, color })
										}
									/>
									<Link
										href={`/app/people/${person.id}`}
										className="min-w-0 flex-1"
									>
										<p className="truncate text-sm font-medium text-foreground">
											{person.name}
										</p>
									</Link>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="sm"
												aria-label={`Actions for ${person.name}`}
											>
												<MoreHorizontal className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												onSelect={() => {
													setRenameValue(person.name);
													setPending({ kind: "rename", person });
												}}
											>
												<Pencil className="mr-2 h-3.5 w-3.5" />
												Rename
											</DropdownMenuItem>
											<DropdownMenuItem
												disabled={people.length < 2}
												onSelect={() => {
													setMergeTargetId("");
													setPending({ kind: "merge", person });
												}}
											>
												<Merge className="mr-2 h-3.5 w-3.5" />
												Merge into…
											</DropdownMenuItem>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												className="text-destructive focus:text-destructive"
												onSelect={() =>
													setPending({ kind: "delete", person })
												}
											>
												<Trash2 className="mr-2 h-3.5 w-3.5" />
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>

			<Dialog
				open={pending?.kind === "rename"}
				onOpenChange={(open) => !open && setPending(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Rename person</DialogTitle>
						<DialogDescription>
							Mentions resolve the name live, so every $chip updates immediately.
						</DialogDescription>
					</DialogHeader>
					<Input
						value={renameValue}
						onChange={(event) => setRenameValue(event.target.value)}
						onKeyDown={(event) => event.key === "Enter" && submitRename()}
						autoFocus
					/>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" size="sm">
								Cancel
							</Button>
						</DialogClose>
						<Button size="sm" onClick={submitRename} disabled={updatePerson.isPending}>
							Rename
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={pending?.kind === "merge"}
				onOpenChange={(open) => !open && setPending(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Merge {pending?.person.name} into…</DialogTitle>
						<DialogDescription>
							Every mention of {pending?.person.name} is repointed at the person you
							pick, then the duplicate is removed.
						</DialogDescription>
					</DialogHeader>
					<ul className="max-h-64 overflow-y-auto rounded-md border border-border">
						{people.flatMap((person) =>
							person.id === pending?.person.id
								? []
								: [
										<li key={person.id}>
											<button
												type="button"
												onClick={() => setMergeTargetId(person.id)}
												className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
													mergeTargetId === person.id ? "bg-muted" : ""
												}`}
											>
												{person.name}
											</button>
										</li>,
									],
						)}
					</ul>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" size="sm">
								Cancel
							</Button>
						</DialogClose>
						<Button
							size="sm"
							onClick={submitMerge}
							disabled={!mergeTargetId || mergePersons.isPending}
						>
							Merge
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={pending?.kind === "delete"}
				onOpenChange={(open) => !open && setPending(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete {pending?.person.name}?</DialogTitle>
						<DialogDescription>
							Their mentions become plain text and they're removed from person fields.
							This cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" size="sm">
								Cancel
							</Button>
						</DialogClose>
						<Button
							variant="destructive"
							size="sm"
							onClick={submitDelete}
							disabled={deletePerson.isPending}
						>
							Delete person
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</LayoutContainer>
	);
}
