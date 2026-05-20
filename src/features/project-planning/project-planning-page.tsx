"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { CustomSection, Feature, FeatureStatus, NiceToHave, ScratchEntry } from "./types";
import { PlanningShell } from "./components/planning-shell";
import { PlanningOverview } from "./components/planning-overview";
import { FeatureCard } from "./components/feature-card";
import { NiceToHaveSection } from "./components/nice-to-have-section";
import { ScratchpadSection } from "./components/scratchpad-section";
import { AdminOnly } from "./components/admin-only";
import { EditTextDialog } from "./components/edit-text-dialog";
import { EditNiceToHaveDialog, type NiceDraft } from "./components/edit-nice-to-have-dialog";
import { EditScratchDialog, type ScratchDraft } from "./components/edit-scratch-dialog";
import { EditIssueDialog, emptyIssueDraft, type IssueDraft } from "./components/edit-issue-dialog";
import type { Section } from "./components/move-menu";
import { KanbanBoard } from "./components/kanban-board";
import { BacklogView } from "./components/backlog-view";
import { CustomSectionView } from "./components/custom-section";
import { EditSectionDialog, type SectionDraftValue } from "./components/edit-section-dialog";
import {
	EditSectionItemDialog,
	emptySectionItemDraft,
	type SectionItemDraftValue,
} from "./components/edit-section-item-dialog";
import {
	createCustomItem,
	createCustomSection,
	createFeature,
	createIssue,
	createNiceToHave,
	createScratch,
	deleteCustomItem,
	deleteCustomSection,
	deleteFeature,
	deleteIssue,
	deleteNiceToHave,
	deleteScratch,
	moveFeature,
	moveNiceToHave,
	moveScratch,
	updateCustomItem,
	updateCustomSection,
	updateFeature,
	updateFeatureStatus,
	updateIssue,
	updateNiceToHave,
	updateScratch,
} from "./server/actions";

type View = "list" | "kanban" | "backlog";

type Props = {
	initialFeatures: Feature[];
	initialNiceToHaves: NiceToHave[];
	initialScratch: ScratchEntry[];
	initialCustomSections: CustomSection[];
	isAdmin: boolean;
	isSignedIn: boolean;
};

type EditState = {
	open: boolean;
	title: string;
	label: string;
	value: string;
	onSubmit: (next: string) => void;
};

const closedEdit: EditState = {
	open: false,
	title: "",
	label: "Title",
	value: "",
	onSubmit: () => {},
};

type NiceEditState = {
	open: boolean;
	title: string;
	initial: NiceDraft;
	onSubmit: (value: NiceDraft) => void;
};

const emptyNice: NiceDraft = { title: "", description: "", reason: "", priority: "medium" };
const closedNice: NiceEditState = {
	open: false,
	title: "",
	initial: emptyNice,
	onSubmit: () => {},
};

type ScratchEditState = {
	open: boolean;
	title: string;
	initial: ScratchDraft;
	onSubmit: (value: ScratchDraft) => void;
};

const emptyScratch: ScratchDraft = { title: "", content: "", type: "note" };
const closedScratch: ScratchEditState = {
	open: false,
	title: "",
	initial: emptyScratch,
	onSubmit: () => {},
};

type IssueEditState = {
	open: boolean;
	title: string;
	submitLabel: string;
	initial: IssueDraft;
	onSubmit: (value: IssueDraft) => void;
};

const closedIssue: IssueEditState = {
	open: false,
	title: "",
	submitLabel: "Save",
	initial: emptyIssueDraft,
	onSubmit: () => {},
};

type SectionEditState = {
	open: boolean;
	title: string;
	submitLabel: string;
	initial: SectionDraftValue;
	onSubmit: (value: SectionDraftValue) => void;
};

const emptySectionDraft: SectionDraftValue = { title: "", description: "" };
const closedSection: SectionEditState = {
	open: false,
	title: "",
	submitLabel: "Save",
	initial: emptySectionDraft,
	onSubmit: () => {},
};

type SectionItemEditState = {
	open: boolean;
	title: string;
	submitLabel: string;
	initial: SectionItemDraftValue;
	onSubmit: (value: SectionItemDraftValue) => void;
};

const closedSectionItem: SectionItemEditState = {
	open: false,
	title: "",
	submitLabel: "Save",
	initial: emptySectionItemDraft,
	onSubmit: () => {},
};

export function ProjectPlanningPage({
	initialFeatures,
	initialNiceToHaves,
	initialScratch,
	initialCustomSections,
	isAdmin,
	isSignedIn,
}: Props) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [features, setFeatures] = useState<Feature[]>(initialFeatures);
	const [niceToHaves, setNiceToHaves] = useState<NiceToHave[]>(initialNiceToHaves);
	const [scratch, setScratch] = useState<ScratchEntry[]>(initialScratch);
	const [customSections, setCustomSections] = useState<CustomSection[]>(initialCustomSections);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [edit, setEdit] = useState<EditState>(closedEdit);
	const [niceEdit, setNiceEdit] = useState<NiceEditState>(closedNice);
	const [scratchEdit, setScratchEdit] = useState<ScratchEditState>(closedScratch);
	const [issueEdit, setIssueEdit] = useState<IssueEditState>(closedIssue);
	const [sectionEdit, setSectionEdit] = useState<SectionEditState>(closedSection);
	const [sectionItemEdit, setSectionItemEdit] = useState<SectionItemEditState>(closedSectionItem);
	const [view, setView] = useState<View>("list");
	const [error, setError] = useState<string | null>(null);

	const selected = useMemo(
		() => features.find((f) => f.id === selectedId) ?? null,
		[features, selectedId],
	);

	// Run a server mutation. On error, refresh from server and surface the message.
	const run = useCallback(
		(fn: () => Promise<unknown>) => {
			startTransition(async () => {
				try {
					await fn();
				} catch (e) {
					setError(e instanceof Error ? e.message : "Something went wrong");
					router.refresh();
				}
			});
		},
		[router],
	);

	function handleNewTopic() {
		if (!isAdmin) return;
		run(async () => {
			const created = await createFeature({ title: "New topic", description: "" });
			setFeatures((prev) => [created, ...prev]);
			setSelectedId(created.id);
		});
	}

	function handleDeleteFeature(id: string) {
		setFeatures((prev) => prev.filter((f) => f.id !== id));
		if (selectedId === id) setSelectedId(null);
		run(() => deleteFeature(id));
	}

	function handleEditFeature(id: string) {
		const current = features.find((f) => f.id === id);
		if (!current) return;
		setEdit({
			open: true,
			title: "Rename topic",
			label: "Title",
			value: current.title,
			onSubmit: (next) => {
				setFeatures((prev) => prev.map((f) => (f.id === id ? { ...f, title: next } : f)));
				run(() => updateFeature(id, { title: next }));
			},
		});
	}

	function handleAddIssue(featureId: string) {
		setIssueEdit({
			open: true,
			title: "New issue",
			submitLabel: "Create issue",
			initial: emptyIssueDraft,
			onSubmit: (draft) =>
				run(async () => {
					const created = await createIssue(featureId, draft);
					setFeatures((prev) =>
						prev.map((f) =>
							f.id === featureId ? { ...f, issues: [...f.issues, created] } : f,
						),
					);
				}),
		});
	}

	function handleEditIssue(featureId: string, issueId: string) {
		const current = features
			.find((f) => f.id === featureId)
			?.issues.find((i) => i.id === issueId);
		if (!current) return;
		setIssueEdit({
			open: true,
			title: "Edit issue",
			submitLabel: "Save changes",
			initial: {
				title: current.title,
				description: current.description,
				status: current.status,
				priority: current.priority,
				assignee: current.assignee ?? "",
				tags: current.tags,
				notes: current.notes ?? "",
			},
			onSubmit: (draft) => {
				setFeatures((prev) =>
					prev.map((f) =>
						f.id === featureId
							? {
									...f,
									issues: f.issues.map((i) =>
										i.id === issueId ? { ...i, ...draft } : i,
									),
								}
							: f,
					),
				);
				run(() =>
					updateIssue(issueId, {
						title: draft.title,
						description: draft.description,
						status: draft.status,
						priority: draft.priority,
						assignee: draft.assignee?.trim() || null,
						tags: draft.tags,
						notes: draft.notes?.trim() || null,
					}),
				);
			},
		});
	}

	function handleDeleteIssue(featureId: string, issueId: string) {
		setFeatures((prev) =>
			prev.map((f) =>
				f.id === featureId ? { ...f, issues: f.issues.filter((i) => i.id !== issueId) } : f,
			),
		);
		run(() => deleteIssue(issueId));
	}

	function handleCreateNice() {
		setNiceEdit({
			open: true,
			title: "New nice to have",
			initial: emptyNice,
			onSubmit: (draft) =>
				run(async () => {
					const created = await createNiceToHave(draft);
					setNiceToHaves((prev) => [created, ...prev]);
				}),
		});
	}

	function handleEditNice(id: string) {
		const current = niceToHaves.find((n) => n.id === id);
		if (!current) return;
		setNiceEdit({
			open: true,
			title: "Edit nice to have",
			initial: {
				title: current.title,
				description: current.description,
				reason: current.reason,
				priority: current.priority,
			},
			onSubmit: (draft) => {
				setNiceToHaves((prev) => prev.map((n) => (n.id === id ? { ...n, ...draft } : n)));
				run(() => updateNiceToHave(id, draft));
			},
		});
	}

	function handleDeleteNice(id: string) {
		setNiceToHaves((prev) => prev.filter((n) => n.id !== id));
		run(() => deleteNiceToHave(id));
	}

	function handleCreateScratch() {
		setScratchEdit({
			open: true,
			title: "New note",
			initial: emptyScratch,
			onSubmit: (draft) =>
				run(async () => {
					const created = await createScratch(draft);
					setScratch((prev) => [created, ...prev]);
				}),
		});
	}

	function handleEditScratch(id: string) {
		const current = scratch.find((s) => s.id === id);
		if (!current) return;
		setScratchEdit({
			open: true,
			title: "Edit note",
			initial: { title: current.title, content: current.content, type: current.type },
			onSubmit: (draft) => {
				setScratch((prev) => prev.map((s) => (s.id === id ? { ...s, ...draft } : s)));
				run(() => updateScratch(id, draft));
			},
		});
	}

	function handleDeleteScratch(id: string) {
		setScratch((prev) => prev.filter((s) => s.id !== id));
		run(() => deleteScratch(id));
	}

	function handleCreateSection() {
		setSectionEdit({
			open: true,
			title: "New section",
			submitLabel: "Create section",
			initial: emptySectionDraft,
			onSubmit: (value) =>
				run(async () => {
					const created = await createCustomSection(value);
					setCustomSections((prev) => [...prev, created]);
				}),
		});
	}

	function handleEditSection(id: string) {
		const current = customSections.find((s) => s.id === id);
		if (!current) return;
		setSectionEdit({
			open: true,
			title: "Rename section",
			submitLabel: "Save",
			initial: { title: current.title, description: current.description },
			onSubmit: (value) => {
				setCustomSections((prev) =>
					prev.map((s) => (s.id === id ? { ...s, ...value } : s)),
				);
				run(() => updateCustomSection(id, value));
			},
		});
	}

	function handleDeleteSection(id: string) {
		setCustomSections((prev) => prev.filter((s) => s.id !== id));
		run(() => deleteCustomSection(id));
	}

	function handleCreateSectionItem(sectionId: string) {
		setSectionItemEdit({
			open: true,
			title: "New item",
			submitLabel: "Create",
			initial: emptySectionItemDraft,
			onSubmit: (value) =>
				run(async () => {
					const created = await createCustomItem(sectionId, value);
					setCustomSections((prev) =>
						prev.map((s) =>
							s.id === sectionId ? { ...s, items: [...s.items, created] } : s,
						),
					);
				}),
		});
	}

	function handleEditSectionItem(sectionId: string, itemId: string) {
		const current = customSections
			.find((s) => s.id === sectionId)
			?.items.find((i) => i.id === itemId);
		if (!current) return;
		setSectionItemEdit({
			open: true,
			title: "Edit item",
			submitLabel: "Save",
			initial: {
				title: current.title,
				content: current.content,
				priority: current.priority,
				tags: current.tags,
			},
			onSubmit: (value) => {
				setCustomSections((prev) =>
					prev.map((s) =>
						s.id === sectionId
							? {
									...s,
									items: s.items.map((i) =>
										i.id === itemId ? { ...i, ...value } : i,
									),
								}
							: s,
					),
				);
				run(() => updateCustomItem(itemId, value));
			},
		});
	}

	function handleDeleteSectionItem(sectionId: string, itemId: string) {
		setCustomSections((prev) =>
			prev.map((s) =>
				s.id === sectionId ? { ...s, items: s.items.filter((i) => i.id !== itemId) } : s,
			),
		);
		run(() => deleteCustomItem(itemId));
	}

	function handleChangeFeatureStatus(id: string, status: FeatureStatus) {
		setFeatures((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
		run(() => updateFeatureStatus(id, status));
	}

	function handleMoveFeature(id: string, to: Section) {
		if (to === "roadmap") return;
		setFeatures((prev) => prev.filter((x) => x.id !== id));
		if (selectedId === id) setSelectedId(null);
		run(async () => {
			await moveFeature(id, to);
			router.refresh();
		});
	}

	function handleMoveNice(id: string, to: Section) {
		if (to === "nice") return;
		setNiceToHaves((prev) => prev.filter((x) => x.id !== id));
		run(async () => {
			await moveNiceToHave(id, to === "roadmap" ? "roadmap" : "scratch");
			router.refresh();
		});
	}

	function handleMoveScratch(id: string, to: Section) {
		if (to === "scratch") return;
		setScratch((prev) => prev.filter((x) => x.id !== id));
		run(async () => {
			await moveScratch(id, to === "roadmap" ? "roadmap" : "nice");
			router.refresh();
		});
	}

	const visibleFeatures = selected ? [selected] : features;

	return (
		<PlanningShell
			features={features}
			selectedId={selectedId}
			onSelect={setSelectedId}
			isAdmin={isAdmin}
			isPending={isPending}
			onNewTopic={handleNewTopic}
		>
			<div className="mx-auto max-w-5xl px-6 py-6 space-y-8">
				<header className="flex items-start justify-between gap-3">
					<div>
						<h1 className="text-xl font-semibold text-foreground">Project Planning</h1>
						<p className="mt-1 text-sm text-muted-foreground max-w-2xl">
							A public view of what we&apos;re exploring, planning, building, and have
							shipped.
							{!isSignedIn && " Sign in for editing access."}
						</p>
					</div>
					<AdminOnly isAdmin={isAdmin}>
						<div className="flex items-center gap-2">
							<button
								onClick={handleCreateSection}
								className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
							>
								<Plus className="h-3.5 w-3.5" /> New section
							</button>
							<button
								onClick={handleNewTopic}
								className="inline-flex items-center gap-1.5 rounded-md border border-border bg-accent/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
							>
								<Plus className="h-3.5 w-3.5" /> New topic
							</button>
						</div>
					</AdminOnly>
				</header>

				{error && (
					<div
						role="alert"
						className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
					>
						<span>{error}</span>
						<button
							onClick={() => setError(null)}
							className="text-destructive/80 hover:text-destructive/60"
							aria-label="Dismiss error"
						>
							✕
						</button>
					</div>
				)}

				{!selected && <PlanningOverview features={features} />}

				<section className="space-y-3">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold text-foreground">
							{selected ? "Topic" : "Roadmap"}
						</h2>
						{!selected && (
							<div className="inline-flex rounded-md border border-border overflow-hidden">
								<ViewBtn active={view === "list"} onClick={() => setView("list")}>
									List
								</ViewBtn>
								<ViewBtn
									active={view === "backlog"}
									onClick={() => setView("backlog")}
								>
									Backlog
								</ViewBtn>
								<ViewBtn
									active={view === "kanban"}
									onClick={() => setView("kanban")}
								>
									Kanban
								</ViewBtn>
							</div>
						)}
					</div>
					{visibleFeatures.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							{isAdmin
								? "Nothing here yet."
								: "Nothing on the roadmap yet — check back soon."}
						</p>
					) : selected || view === "list" ? (
						<div className="space-y-3">
							{visibleFeatures.map((f) => (
								<FeatureCard
									key={f.id}
									feature={f}
									isAdmin={isAdmin}
									onEdit={handleEditFeature}
									onDelete={handleDeleteFeature}
									onAddIssue={handleAddIssue}
									onEditIssue={handleEditIssue}
									onDeleteIssue={handleDeleteIssue}
									onMove={handleMoveFeature}
								/>
							))}
						</div>
					) : view === "backlog" ? (
						<BacklogView
							features={features}
							isAdmin={isAdmin}
							onSelect={setSelectedId}
							onEdit={handleEditFeature}
							onDelete={handleDeleteFeature}
							onMove={handleMoveFeature}
						/>
					) : (
						<KanbanBoard
							features={features}
							isAdmin={isAdmin}
							onSelect={setSelectedId}
							onEdit={handleEditFeature}
							onDelete={handleDeleteFeature}
							onMove={handleMoveFeature}
							onChangeStatus={handleChangeFeatureStatus}
						/>
					)}
				</section>

				{!selected && (
					<>
						<NiceToHaveSection
							items={niceToHaves}
							isAdmin={isAdmin}
							onCreate={handleCreateNice}
							onEdit={handleEditNice}
							onDelete={handleDeleteNice}
							onMove={handleMoveNice}
						/>
						<ScratchpadSection
							items={scratch}
							isAdmin={isAdmin}
							onCreate={handleCreateScratch}
							onEdit={handleEditScratch}
							onDelete={handleDeleteScratch}
							onMove={handleMoveScratch}
						/>

						{customSections.map((section) => (
							<CustomSectionView
								key={section.id}
								section={section}
								isAdmin={isAdmin}
								onEditSection={handleEditSection}
								onDeleteSection={handleDeleteSection}
								onCreateItem={handleCreateSectionItem}
								onEditItem={handleEditSectionItem}
								onDeleteItem={handleDeleteSectionItem}
							/>
						))}
					</>
				)}
			</div>

			<EditTextDialog
				open={edit.open}
				title={edit.title}
				label={edit.label}
				initialValue={edit.value}
				onSubmit={(next) => {
					edit.onSubmit(next);
					setEdit((prev) => ({ ...prev, open: false }));
				}}
				onOpenChange={(open) => setEdit((prev) => ({ ...prev, open }))}
			/>

			<EditNiceToHaveDialog
				open={niceEdit.open}
				title={niceEdit.title}
				initial={niceEdit.initial}
				onSubmit={(draft) => {
					niceEdit.onSubmit(draft);
					setNiceEdit((prev) => ({ ...prev, open: false }));
				}}
				onOpenChange={(open) => setNiceEdit((prev) => ({ ...prev, open }))}
			/>

			<EditScratchDialog
				open={scratchEdit.open}
				title={scratchEdit.title}
				initial={scratchEdit.initial}
				onSubmit={(draft) => {
					scratchEdit.onSubmit(draft);
					setScratchEdit((prev) => ({ ...prev, open: false }));
				}}
				onOpenChange={(open) => setScratchEdit((prev) => ({ ...prev, open }))}
			/>

			<EditIssueDialog
				open={issueEdit.open}
				title={issueEdit.title}
				submitLabel={issueEdit.submitLabel}
				initial={issueEdit.initial}
				onSubmit={(draft) => {
					issueEdit.onSubmit(draft);
					setIssueEdit((prev) => ({ ...prev, open: false }));
				}}
				onOpenChange={(open) => setIssueEdit((prev) => ({ ...prev, open }))}
			/>

			<EditSectionDialog
				open={sectionEdit.open}
				title={sectionEdit.title}
				submitLabel={sectionEdit.submitLabel}
				initial={sectionEdit.initial}
				onSubmit={(value) => {
					sectionEdit.onSubmit(value);
					setSectionEdit((prev) => ({ ...prev, open: false }));
				}}
				onOpenChange={(open) => setSectionEdit((prev) => ({ ...prev, open }))}
			/>

			<EditSectionItemDialog
				open={sectionItemEdit.open}
				title={sectionItemEdit.title}
				submitLabel={sectionItemEdit.submitLabel}
				initial={sectionItemEdit.initial}
				onSubmit={(value) => {
					sectionItemEdit.onSubmit(value);
					setSectionItemEdit((prev) => ({ ...prev, open: false }));
				}}
				onOpenChange={(open) => setSectionItemEdit((prev) => ({ ...prev, open }))}
			/>
		</PlanningShell>
	);
}

function ViewBtn({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			onClick={onClick}
			aria-pressed={active}
			className={`px-2.5 py-1 text-xs border-l border-border first:border-l-0 ${
				active
					? "bg-accent text-foreground"
					: "text-muted-foreground hover:text-foreground hover:bg-accent/40"
			}`}
		>
			{children}
		</button>
	);
}
