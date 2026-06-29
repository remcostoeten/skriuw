"use client";

import { AlignLeft, Check, Rows3, SlidersHorizontal } from "lucide-react";
import { usePreferencesStore } from "@/features/settings/store";
import {
	NOTE_PROPERTY_TEMPLATES,
	createCustomNotePropertyTemplate,
	instantiateCustomNotePropertyTemplate,
	normalizeNoteProperties,
	type CustomNotePropertyTemplate,
	type NoteProperty,
	type NotePropertyTemplate,
} from "@/domain/notes/properties";
import {
	AddPropertyButton,
	InlinePropertyChip,
	PropertyRow,
	TemplatePicker,
} from "./property-row";
import { NotePropertiesPopover } from "./popover";

type Layout = "rows" | "inline";

export function NotePropertiesShelf({
	properties,
	readOnly,
	onChange,
}: {
	properties: NoteProperty[];
	readOnly?: boolean;
	onChange?: (properties: NoteProperty[]) => void;
}) {
	const layout = usePreferencesStore((state) => state.editor.notePropertiesLayout);
	const defaultTemplateId = usePreferencesStore(
		(state) => state.editor.notePropertiesDefaultTemplateId,
	);
	const customTemplates = usePreferencesStore(
		(state) => state.editor.customNotePropertyTemplates,
	);
	const updateEditorPreference = usePreferencesStore((state) => state.updateEditorPreference);
	const normalizedProperties = normalizeNoteProperties(properties);

	function commit(next: NoteProperty[]) {
		if (readOnly) return;
		onChange?.(normalizeNoteProperties(next));
	}

	function updateProperty(id: string, next: NoteProperty) {
		commit(normalizedProperties.map((property) => (property.id === id ? next : property)));
	}

	function applyTemplate(template: NotePropertyTemplate) {
		commit(template.build());
	}

	function applyCustomTemplate(template: CustomNotePropertyTemplate) {
		commit(instantiateCustomNotePropertyTemplate(template));
	}

	function saveCurrentAsTemplate(name: string) {
		updateEditorPreference("customNotePropertyTemplates", [
			...customTemplates,
			createCustomNotePropertyTemplate(name, normalizedProperties),
		]);
	}

	function deleteCustomTemplate(id: string) {
		updateEditorPreference(
			"customNotePropertyTemplates",
			customTemplates.filter((template) => template.id !== id),
		);
	}

	const templatePickerProps = {
		customTemplates,
		canSaveCurrent: normalizedProperties.length > 0,
		onApply: applyTemplate,
		onApplyCustom: applyCustomTemplate,
		onSaveCurrent: saveCurrentAsTemplate,
		onDeleteCustom: deleteCustomTemplate,
	};

	return (
		<section
			data-note-properties-shelf
			className="group relative mx-auto mt-1 mb-2 w-full max-w-[42rem]"
			aria-label="Note properties"
		>
			{layout === "rows" ? (
				<div className="flex flex-col gap-0.5">
					{normalizedProperties.map((property) => (
						<PropertyRow
							key={property.id}
							property={property}
							onChange={(next) => updateProperty(property.id, next)}
							onRemove={() =>
								commit(normalizedProperties.filter((item) => item.id !== property.id))
							}
						/>
					))}
					<div className="mt-0.5 flex items-center gap-1 opacity-55 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
						<AddPropertyButton onAdd={(property) => commit([...normalizedProperties, property])} />
						<TemplatePicker {...templatePickerProps} />
					</div>
				</div>
			) : (
				<div>
					<div className="flex flex-wrap items-center gap-1.5">
						{normalizedProperties.map((property) => (
							<InlinePropertyChip
								key={property.id}
								property={property}
								onChange={(next) => updateProperty(property.id, next)}
								onRemove={() =>
									commit(normalizedProperties.filter((item) => item.id !== property.id))
								}
							/>
						))}
						<AddPropertyButton
							compact
							onAdd={(property) => commit([...normalizedProperties, property])}
						/>
					</div>
					<div className="mt-1.5 opacity-55 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
						<TemplatePicker {...templatePickerProps} />
					</div>
				</div>
			)}

			<LayoutMenu
				layout={layout}
				defaultTemplateId={defaultTemplateId}
				onLayoutChange={(nextLayout) =>
					updateEditorPreference("notePropertiesLayout", nextLayout)
				}
				onDefaultTemplateChange={(templateId) =>
					updateEditorPreference("notePropertiesDefaultTemplateId", templateId)
				}
			/>
		</section>
	);
}

function LayoutMenu({
	layout,
	defaultTemplateId,
	onLayoutChange,
	onDefaultTemplateChange,
}: {
	layout: Layout;
	defaultTemplateId: string | null;
	onLayoutChange: (layout: Layout) => void;
	onDefaultTemplateChange: (templateId: string | null) => void;
}) {
	const options: Array<{ value: Layout; label: string; icon: typeof Rows3 }> = [
		{
			value: "rows",
			label: "Rows",
			icon: Rows3,
		},
		{
			value: "inline",
			label: "Inline",
			icon: AlignLeft,
		},
	];
	const active = options.find((option) => option.value === layout) ?? options[0]!;
	const ActiveIcon = active.icon;

	return (
		<NotePropertiesPopover
			align="end"
			wrapperClassName="absolute right-0 top-0 z-20"
			trigger={({ toggle, open }) => (
				<button
					type="button"
					onClick={toggle}
					aria-label="Choose note property layout"
					aria-expanded={open}
					className="inline-flex size-6 items-center justify-center rounded-md border border-border/60 bg-card/70 text-muted-foreground shadow-sm outline-none transition-colors hover:border-border hover:bg-accent hover:text-foreground focus-visible:border-border focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
				>
					<ActiveIcon className="size-3.5" />
					<span className="absolute -right-1 -top-1 flex size-3 items-center justify-center rounded-full border border-border bg-background text-[8px] text-muted-foreground">
						<SlidersHorizontal className="size-2" />
					</span>
				</button>
			)}
		>
			{({ close }) => (
				<div className="w-44 p-1">
					<p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/55">
						Layout
					</p>
					{options.map((option) => {
						const Icon = option.icon;
						const selected = option.value === layout;
						return (
							<button
								key={option.value}
								type="button"
								onClick={() => {
									onLayoutChange(option.value);
									close();
								}}
								className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium outline-none transition-colors focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50 ${
									selected
										? "bg-accent text-foreground"
										: "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
								}`}
							>
								<Icon className="size-3.5 shrink-0" />
								<span className="min-w-0 flex-1 truncate">{option.label}</span>
								{selected ? <Check className="size-3.5 shrink-0" /> : null}
							</button>
						);
					})}
					<div className="my-1 h-px bg-border/60" />
					<p className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/55">
						New note template
					</p>
					<TemplateMenuItem
						label="None"
						selected={defaultTemplateId === null}
						onSelect={() => {
							onDefaultTemplateChange(null);
							close();
						}}
					/>
					{NOTE_PROPERTY_TEMPLATES.filter((template) => template.id !== "blank").map(
						(template) => (
							<TemplateMenuItem
								key={template.id}
								label={template.name}
								selected={defaultTemplateId === template.id}
								onSelect={() => {
									onDefaultTemplateChange(template.id);
									close();
								}}
							/>
						),
					)}
				</div>
			)}
		</NotePropertiesPopover>
	);
}

function TemplateMenuItem({
	label,
	selected,
	onSelect,
}: {
	label: string;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium outline-none transition-colors focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50 ${
				selected
					? "bg-accent text-foreground"
					: "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
			}`}
		>
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{selected ? <Check className="size-3.5 shrink-0" /> : null}
		</button>
	);
}
