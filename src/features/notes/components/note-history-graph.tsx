"use client";

import { cn } from "@/shared/lib/utils";

export type HistoryBranchRole = "head" | "branch" | "fork" | "trunk";

const TRUNK_X = 12;
const BRANCH_X = 26;
const RAIL_WIDTH = 1.25;
const GRAPH_WIDTH = 32;

export function getHistoryBranchRoles<
	T extends { reasonKind: string },
>(items: T[]): HistoryBranchRole[] {
	const forkIndex = items.findIndex(
		(item, index) => index > 0 && item.reasonKind === "restore",
	);

	if (forkIndex === -1) {
		return items.map((_, index) => (index === 0 ? "head" : "trunk"));
	}

	return items.map((_, index) => {
		if (index === 0) return "head";
		if (index < forkIndex) return "branch";
		if (index === forkIndex) return "fork";
		return "trunk";
	});
}

export function findRestoredSourceIndex<
	T extends { content: string },
>(items: T[], forkIndex: number): number | null {
	if (forkIndex === -1) return null;

	const currentContent = items[0]?.content;
	if (!currentContent) return null;

	for (let index = forkIndex + 1; index < items.length; index += 1) {
		if (items[index].content === currentContent) {
			return index;
		}
	}

	return null;
}

function historyLaneX(role: HistoryBranchRole, hasFork: boolean) {
	if (!hasFork) return TRUNK_X;
	if (role === "head" || role === "branch") return BRANCH_X;
	return TRUNK_X;
}

function HistoryRailSegment({
	x,
	isFirst,
	isLast,
	dashed = false,
}: {
	x: number;
	isFirst: boolean;
	isLast: boolean;
	dashed?: boolean;
}) {
	if (dashed) {
		return (
			<>
				{!isFirst ? (
					<span
						aria-hidden
						className="absolute top-0 h-1/2 w-0 -translate-x-1/2 border-l border-dashed border-border/80"
						style={{ left: x }}
					/>
				) : null}
				{!isLast ? (
					<span
						aria-hidden
						className="absolute bottom-0 h-1/2 w-0 -translate-x-1/2 border-l border-dashed border-border/80"
						style={{ left: x }}
					/>
				) : null}
			</>
		);
	}

	return (
		<>
			{!isFirst ? (
				<svg
					aria-hidden
					className="pointer-events-none absolute left-0 top-0 h-1/2 w-8 overflow-visible text-border/90"
					viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_WIDTH / 2}`}
					preserveAspectRatio="none"
				>
					<path
						d={`M ${x} ${GRAPH_WIDTH / 2} V 0`}
						fill="none"
						stroke="currentColor"
						strokeWidth={RAIL_WIDTH}
						strokeLinecap="round"
					/>
				</svg>
			) : null}
			{!isLast ? (
				<svg
					aria-hidden
					className="pointer-events-none absolute bottom-0 left-0 h-1/2 w-8 overflow-visible text-border/90"
					viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_WIDTH / 2}`}
					preserveAspectRatio="none"
				>
					<path
						d={`M ${x} 0 V ${GRAPH_WIDTH / 2}`}
						fill="none"
						stroke="currentColor"
						strokeWidth={RAIL_WIDTH}
						strokeLinecap="round"
					/>
				</svg>
			) : null}
		</>
	);
}

function ForkRailConnector() {
	const midY = GRAPH_WIDTH / 2;

	return (
		<svg
			aria-hidden
			className="pointer-events-none absolute left-0 top-0 h-full w-8 overflow-visible"
			viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_WIDTH}`}
			preserveAspectRatio="none"
		>
			<path
				d={`M ${TRUNK_X} ${midY} V ${GRAPH_WIDTH}`}
				fill="none"
				stroke="currentColor"
				strokeWidth={RAIL_WIDTH}
				strokeLinecap="round"
				className="text-border/90"
			/>
			<path
				d={`M ${TRUNK_X} ${midY} C ${TRUNK_X + 2} ${midY - 1}, ${BRANCH_X - 5} 4, ${BRANCH_X} 0`}
				fill="none"
				stroke="currentColor"
				strokeWidth={RAIL_WIDTH}
				strokeLinecap="round"
				className="text-border/90"
			/>
			<path
				d={`M ${TRUNK_X} ${midY} C ${TRUNK_X + 1} ${midY - 0.5}, ${BRANCH_X - 4} 3, ${BRANCH_X} 0`}
				fill="none"
				stroke="currentColor"
				strokeWidth={RAIL_WIDTH + 0.25}
				strokeLinecap="round"
				className="text-amber-400/85"
			/>
			<path
				d={`M ${BRANCH_X} 0 V ${midY}`}
				fill="none"
				stroke="currentColor"
				strokeWidth={RAIL_WIDTH}
				strokeLinecap="round"
				className="text-border/90"
			/>
		</svg>
	);
}

function HistoryGraphNodeDot({
	branchRole,
	isCurrent,
	laneX,
}: {
	branchRole: HistoryBranchRole;
	isCurrent?: boolean;
	laneX: number;
}) {
	const isFork = branchRole === "fork";
	const isHead = branchRole === "head";

	return (
		<span
			className={cn(
				"absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-background transition-colors duration-150",
				isHead && "h-2 w-2 bg-emerald-400 ring-emerald-400/25",
				isFork && "h-2 w-2 bg-amber-400 ring-amber-400/30",
				!isHead &&
					!isFork &&
					"h-1.5 w-1.5 bg-muted-foreground/38 group-hover:bg-foreground/58",
				isCurrent && !isHead && !isFork && "bg-emerald-400/85 ring-emerald-400/20",
			)}
			style={{ left: laneX }}
			aria-hidden
		/>
	);
}

export function HistoryGraphRail({
	branchRole,
	isFirst,
	isLast,
	isCurrent,
	hasFork,
	isRestoredTrunkLink,
}: {
	branchRole: HistoryBranchRole;
	isFirst: boolean;
	isLast: boolean;
	isCurrent?: boolean;
	hasFork: boolean;
	isRestoredTrunkLink?: boolean;
}) {
	const laneX = historyLaneX(branchRole, hasFork);
	const isFork = branchRole === "fork";
	const onBranchLane = branchRole === "head" || branchRole === "branch";

	if (!hasFork) {
		return (
			<>
				<HistoryRailSegment
					x={laneX}
					isFirst={isFirst}
					isLast={isLast}
					dashed={isRestoredTrunkLink}
				/>
				<HistoryGraphNodeDot
					branchRole={branchRole}
					isCurrent={isCurrent}
					laneX={laneX}
				/>
			</>
		);
	}

	return (
		<>
			{onBranchLane ? (
				<HistoryRailSegment
					x={BRANCH_X}
					isFirst={isFirst}
					isLast={isLast}
					dashed={false}
				/>
			) : null}

			{isFork ? <ForkRailConnector /> : null}

			{branchRole === "trunk" ? (
				<HistoryRailSegment
					x={TRUNK_X}
					isFirst={isFirst}
					isLast={isLast}
					dashed={isRestoredTrunkLink}
				/>
			) : null}

			<HistoryGraphNodeDot
				branchRole={branchRole}
				isCurrent={isCurrent}
				laneX={laneX}
			/>
		</>
	);
}
