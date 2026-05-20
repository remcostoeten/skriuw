"use client";

import { Pencil, Trash2, Plus } from "lucide-react";
import { AdminOnly } from "./admin-only";
import { ScratchTypeBadge } from "./badges";
import { MoveMenu, type Section } from "./move-menu";
import type { ScratchEntry } from "../types";

type Props = {
	items: ScratchEntry[];
	isAdmin: boolean;
	onCreate: () => void;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
	onMove: (id: string, to: Section) => void;
};

export function ScratchpadSection({ items, isAdmin, onCreate, onEdit, onDelete, onMove }: Props) {
	return (
		<section>
			<header className="mb-3 flex items-center justify-between">
				<div>
					<h2 className="text-sm font-semibold text-foreground">Scratchpad</h2>
					<p className="text-xs text-muted-foreground">
						Notes, prompts, questions and decisions
					</p>
				</div>
				<AdminOnly isAdmin={isAdmin}>
					<button
						onClick={onCreate}
						className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50"
					>
						<Plus className="h-3.5 w-3.5" /> New note
					</button>
				</AdminOnly>
			</header>
			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">Nothing here yet.</p>
			) : (
				<ul className="grid gap-2 md:grid-cols-2">
					{items.map((s) => (
						<li
							key={s.id}
							className="rounded-lg border border-border bg-sidebar/40 p-3"
						>
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<h3 className="text-sm font-medium text-foreground">
											{s.title}
										</h3>
										<ScratchTypeBadge type={s.type} />
									</div>
									{s.content && (
										<p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
											{s.content}
										</p>
									)}
									<p className="mt-2 text-[10px] text-muted-foreground">
										{s.createdAt}
									</p>
								</div>
								<AdminOnly isAdmin={isAdmin}>
									<div className="flex items-center gap-1 shrink-0">
										<MoveMenu
											from="scratch"
											onMove={(to) => onMove(s.id, to)}
										/>
										<button
											aria-label="Edit"
											onClick={() => onEdit(s.id)}
											className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50"
										>
											<Pencil className="h-3.5 w-3.5" />
										</button>
										<button
											aria-label="Delete"
											onClick={() => onDelete(s.id)}
											className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50"
										>
											<Trash2 className="h-3.5 w-3.5" />
										</button>
									</div>
								</AdminOnly>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
