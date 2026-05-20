export type FeatureStatus =
	| "exploring"
	| "planned"
	| "in_progress"
	| "blocked"
	| "completed"
	| "archived";

export type Priority = "low" | "medium" | "high" | "critical";

export type IssueStatus = "todo" | "in_progress" | "blocked" | "done";

export type ScratchType = "prompt" | "note" | "idea" | "decision" | "question";

export type Issue = {
	id: string;
	featureId: string;
	title: string;
	description: string;
	status: IssueStatus;
	priority: Priority;
	assignee?: string;
	createdAt: string;
	updatedAt: string;
	tags: string[];
	notes?: string;
};

export type Feature = {
	id: string;
	title: string;
	slug: string;
	status: FeatureStatus;
	description: string;
	priority: Priority;
	createdAt: string;
	updatedAt: string;
	tags: string[];
	issues: Issue[];
};

export type NiceToHave = {
	id: string;
	title: string;
	description: string;
	reason: string;
	priority: Priority;
	createdAt: string;
};

export type ScratchEntry = {
	id: string;
	title: string;
	content: string;
	type: ScratchType;
	createdAt: string;
};

export type CustomSectionItem = {
	id: string;
	sectionId: string;
	title: string;
	content: string;
	priority: Priority | null;
	tags: string[];
	createdAt: string;
	updatedAt: string;
};

export type CustomSection = {
	id: string;
	slug: string;
	title: string;
	description: string;
	sortOrder: number;
	createdAt: string;
	updatedAt: string;
	items: CustomSectionItem[];
};
