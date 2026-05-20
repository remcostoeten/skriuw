"use client";

import { Pencil, Trash2, Plus } from "lucide-react";
import { AdminOnly } from "./admin-only";
import { PriorityBadge } from "./badges";
import { MoveMenu, type Section } from "./move-menu";
import type { NiceToHave } from "../types";

type Props = {
	items: NiceToHave[];
	isAdmin: boolean;
	onCreate: () => void;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
	onMove: (id: string, to: Section) => void;
};

export function NiceToHaveSection({ items, isAdmin, onCreate, onEdit, onDelete, onMove }: Props) {
	return (
		<section>
			<header className="mb-3 flex items-center justify-between">
				<div>
					<h2 className="text-sm font-semibold text-foreground">Nice to have</h2>
					<p className="text-xs text-muted-foreground">Visible but not committed</p>
				</div>
				<AdminOnly isAdmin={isAdmin}>
					<button
						onClick={onCreate}
						className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50"
					>
						<Plus className="h-3.5 w-3.5" /> New item
					</button>
				</AdminOnly>
			</header>
			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">Nothing parked here yet.</p>
			) : (
				<ul className="grid gap-2 md:grid-cols-2">
					{items.map((n) => (
						<li
							key={n.id}
							className="rounded-lg border border-border bg-sidebar/40 p-3"
						>
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<h3 className="text-sm font-medium text-foreground">
											{n.title}
										</h3>
										<PriorityBadge priority={n.priority} />
									</div>
									{n.description && (
										<p className="mt-1 text-xs text-muted-foreground">
											{n.description}
										</p>
									)}
									{n.reason && (
										<p className="mt-1.5 text-[11px] text-muted-foreground italic">
											{n.reason}
										</p>
									)}
								</div>
								<AdminOnly isAdmin={isAdmin}>
									<div className="flex items-center gap-1 shrink-0">
										<MoveMenu from="nice" onMove={(to) => onMove(n.id, to)} />
										<button
											aria-label="Edit"
											onClick={() => onEdit(n.id)}
											className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50"
										>
											<Pencil className="h-3.5 w-3.5" />
										</button>
										<button
											aria-label="Delete"
											onClick={() => onDelete(n.id)}
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
