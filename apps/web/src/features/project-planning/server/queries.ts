import "server-only";

import { getServerUser } from "@/core/db";
import { prisma } from "@/lib/prisma";
import { isAdmin as roleIsAdmin } from "@/lib/roles";
import type { CustomSection, Feature, NiceToHave, ScratchEntry } from "../types";
import { mapCustomSection, mapFeature, mapNiceToHave, mapScratch } from "./mappers";
import type {
	FeatureRow,
	IssueRow,
	NiceToHaveRow,
	PlanningSectionItemRow,
	PlanningSectionRow,
	ScratchEntryRow,
} from "./rows";

export type PlanningSnapshot = {
	features: Feature[];
	niceToHaves: NiceToHave[];
	scratch: ScratchEntry[];
	customSections: CustomSection[];
	isAdmin: boolean;
	isSignedIn: boolean;
};

function groupByKey<TRow>(rows: TRow[], getKey: (row: TRow) => string): Map<string, TRow[]> {
	const groups = new Map<string, TRow[]>();
	for (const row of rows) {
		const key = getKey(row);
		const group = groups.get(key);
		if (group) {
			group.push(row);
		} else {
			groups.set(key, [row]);
		}
	}
	return groups;
}

export async function fetchPlanningSnapshot(): Promise<PlanningSnapshot> {
	const [{ user }, features, issues, nice, scratch, sections, sectionItems] = await Promise.all([
		getServerUser(),
		prisma.planningFeature.findMany({ orderBy: { updatedAt: "desc" } }),
		prisma.planningIssue.findMany({ orderBy: { createdAt: "asc" } }),
		prisma.planningNiceToHave.findMany({ orderBy: { createdAt: "desc" } }),
		prisma.planningScratchEntry.findMany({ orderBy: { createdAt: "desc" } }),
		prisma.planningSection.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
		prisma.planningSectionItem.findMany({ orderBy: { sortOrder: "asc" } }),
	]);

	const isAdmin = roleIsAdmin(user?.role);

	const featureRows: FeatureRow[] = features.map((f) => ({
		id: f.id,
		title: f.title,
		slug: f.slug,
		description: f.description,
		status: f.status as FeatureRow["status"],
		priority: f.priority as FeatureRow["priority"],
		tags: f.tags,
		created_at: f.createdAt.toISOString(),
		updated_at: f.updatedAt.toISOString(),
	}));
	const issueRows: IssueRow[] = issues.map((i) => ({
		id: i.id,
		feature_id: i.featureId,
		title: i.title,
		description: i.description,
		status: i.status as IssueRow["status"],
		priority: i.priority as IssueRow["priority"],
		assignee: i.assignee,
		tags: i.tags,
		notes: i.notes,
		created_at: i.createdAt.toISOString(),
		updated_at: i.updatedAt.toISOString(),
	}));
	const niceRows: NiceToHaveRow[] = nice.map((n) => ({
		id: n.id,
		title: n.title,
		description: n.description,
		reason: n.reason,
		priority: n.priority as NiceToHaveRow["priority"],
		created_at: n.createdAt.toISOString(),
	}));
	const scratchRows: ScratchEntryRow[] = scratch.map((s) => ({
		id: s.id,
		title: s.title,
		content: s.content,
		type: s.type as ScratchEntryRow["type"],
		created_at: s.createdAt.toISOString(),
	}));
	const sectionRows: PlanningSectionRow[] = sections.map((s) => ({
		id: s.id,
		slug: s.slug,
		title: s.title,
		description: s.description,
		sort_order: s.sortOrder,
		created_at: s.createdAt.toISOString(),
		updated_at: s.updatedAt.toISOString(),
	}));
	const sectionItemRows: PlanningSectionItemRow[] = sectionItems.map((i) => ({
		id: i.id,
		section_id: i.sectionId,
		title: i.title,
		content: i.content,
		priority: (i.priority ?? null) as PlanningSectionItemRow["priority"],
		tags: i.tags,
		sort_order: i.sortOrder,
		created_at: i.createdAt.toISOString(),
		updated_at: i.updatedAt.toISOString(),
	}));

	const issuesByFeatureId = groupByKey(issueRows, (issue) => issue.feature_id);
	const itemsBySectionId = groupByKey(sectionItemRows, (item) => item.section_id);

	return {
		features: featureRows.map((f) => mapFeature(f, issuesByFeatureId.get(f.id) ?? [])),
		niceToHaves: niceRows.map(mapNiceToHave),
		scratch: scratchRows.map(mapScratch),
		customSections: sectionRows.map((s) =>
			mapCustomSection(s, itemsBySectionId.get(s.id) ?? []),
		),
		isAdmin,
		isSignedIn: Boolean(user),
	};
}
