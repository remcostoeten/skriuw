"use client";
/* eslint-disable */

import { useRef, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { PlusIcon as AnimatedPlusIcon } from "@animateicons/react/lucide";
import { LayoutDashboardIcon } from "@/shared/icons/layout-dashboard";
import type { AnimatedIconHandle } from "@/shared/icons/types";
import {
	NOTE_PROPERTY_TEMPLATES,
	NOTE_PROPERTY_TYPES,
	changeNotePropertyType,
	createNoteProperty,
	emptyNotePropertyValue,
	createNotePropertyId,
	type CustomNotePropertyTemplate,
	type NoteProperty,
	type NotePropertyTemplate,
	type NotePropertyType,
} from "@/domain/notes/properties";
import { TYPE_ICON } from "./type-icon";
import { ValueEditor } from "./value-editor";
import { NotePropertiesPopover } from "./popover";
import { submitPropertyField } from "./keyboard";

const PROPERTY_NAME_INPUT_CLASS =
	"w-full rounded-md bg-transparent px-1 py-0.5 outline-none transition-colors hover:text-foreground focus-visible:bg-accent/70 focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/45";

function PropertyTypePicker({
	property,
	onChange,
}: {
	property: NoteProperty;
	onChange: (next: NoteProperty) => void;
}) {
	const Icon = TYPE_ICON[property.type];
	return (
		<NotePropertiesPopover
			trigger={({ toggle, open }) => (
				<button
					type="button"
					onClick={toggle}
					aria-label="Change property type"
					aria-expanded={open}
					className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-colors hover:bg-accent hover:text-foreground hover:opacity-100"
				>
					<Icon className="size-3.5" />
				</button>
			)}
		>
			{({ close }) => (
				<div className="w-44 p-1">
					<p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/55">
						Type
					</p>
					<div className="max-h-64 overflow-y-auto">
						{NOTE_PROPERTY_TYPES.map((meta) => {
							const MetaIcon = TYPE_ICON[meta.type];
							const selected = meta.type === property.type;
							return (
								<button
									key={meta.type}
									type="button"
									onClick={() => {
										onChange(changeNotePropertyType(property, meta.type));
										close();
									}}
									className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium outline-none transition-colors focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50 ${
										selected
											? "bg-accent text-foreground"
											: "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
									}`}
								>
									<MetaIcon className="size-3.5 shrink-0" />
									<span className="min-w-0 flex-1 truncate">{meta.label}</span>
									{selected ? <Check className="size-3.5 shrink-0" /> : null}
								</button>
							);
						})}
					</div>
				</div>
			)}
		</NotePropertiesPopover>
	);
}

export function PropertyRow({
	property,
	onChange,
	onRemove,
}: {
	property: NoteProperty;
	onChange: (next: NoteProperty) => void;
	onRemove: () => void;
}) {
	return (
		<div className="group flex items-start gap-2">
			<div className="flex h-7 w-36 shrink-0 items-center gap-1 text-[13px] text-muted-foreground">
				<PropertyTypePicker property={property} onChange={onChange} />
				<input
					data-note-property-field
					value={property.name}
					aria-label="Property name"
					onChange={(event) => onChange({ ...property, name: event.target.value })}
					onKeyDown={submitPropertyField}
					className={PROPERTY_NAME_INPUT_CLASS}
				/>
			</div>
			<div className="flex min-h-7 min-w-0 flex-1 items-center py-0.5">
				<ValueEditor
					property={property}
					onUpdate={(patch) => onChange({ ...property, ...patch })}
				/>
			</div>
			<button
				type="button"
				onClick={onRemove}
				aria-label={`Remove ${property.name}`}
				className="mt-0.5 rounded-md p-1.5 text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
			>
				<Trash2 className="size-3.5" />
			</button>
		</div>
	);
}

export function InlinePropertyChip({
	property,
	onChange,
	onRemove,
}: {
	property: NoteProperty;
	onChange: (next: NoteProperty) => void;
	onRemove: () => void;
}) {
	return (
		<div className="group inline-flex max-w-full items-center gap-1 rounded-lg border border-border/70 bg-card/40 py-0.5 pl-1.5 pr-1 transition-colors hover:border-border">
			<PropertyTypePicker property={property} onChange={onChange} />
			<input
				data-note-property-field
				value={property.name}
				onChange={(event) => onChange({ ...property, name: event.target.value })}
				onKeyDown={submitPropertyField}
				aria-label="Property name"
				style={{ width: `${Math.max(property.name.length, 3) + 1}ch` }}
				className="min-w-0 rounded-md bg-transparent px-1 py-0.5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground/70 outline-none transition-colors focus-visible:bg-accent/70 focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/45"
			/>
			<span className="h-3.5 w-px shrink-0 bg-border/70" aria-hidden />
			<div className="flex min-w-0 items-center text-[13px] [&_*]:text-[13px]">
				<ValueEditor
					property={property}
					density="inline"
					onUpdate={(patch) => onChange({ ...property, ...patch })}
				/>
			</div>
			<button
				type="button"
				onClick={onRemove}
				aria-label={`Remove ${property.name}`}
				className="shrink-0 rounded p-1 text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
			>
				<Trash2 className="size-3" />
			</button>
		</div>
	);
}

export function AddPropertyButton({
	onAdd,
	compact = false,
}: {
	onAdd: (property: NoteProperty) => void;
	compact?: boolean;
}) {
	const [name, setName] = useState("");

	function create(type: NotePropertyType, close: () => void) {
		const label =
			name.trim() ||
			NOTE_PROPERTY_TYPES.find((propertyType) => propertyType.type === type)?.label ||
			"Property";
		const base = createNoteProperty(type, label);
		base.id = createNotePropertyId("prop");
		base.value = emptyNotePropertyValue(type);
		onAdd(base);
		setName("");
		close();
	}

	return (
		<NotePropertiesPopover
			trigger={({ toggle }) =>
				compact ? (
					<button
						type="button"
						onClick={toggle}
						aria-label="Add property"
						className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border/70 px-2 py-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground/70 transition-colors hover:border-border hover:text-foreground"
					>
						<AnimatedPlusIcon size={14} className="skriuw-animated-icon" />
						Property
					</button>
				) : (
					<button
						type="button"
						onClick={toggle}
						className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
					>
						<AnimatedPlusIcon size={14} className="skriuw-animated-icon" />
						Add property
					</button>
				)
			}
		>
			{({ close }) => (
				<div className="w-56 p-1">
					<input
						aria-label="Property name"
						// react-doctor-disable-next-line react-doctor/no-autofocus -- popover input should receive focus on open.
						autoFocus
						value={name}
						placeholder="Property name..."
						onChange={(event) => setName(event.target.value)}
						className="mb-1 w-full rounded-md bg-accent/70 px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/55 focus-visible:ring-1 focus-visible:ring-ring/45"
					/>
					<p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/55">
						Type
					</p>
					<div className="max-h-64 overflow-y-auto">
						{NOTE_PROPERTY_TYPES.map((meta) => {
							const Icon = TYPE_ICON[meta.type];
							return (
								<button
									key={meta.type}
									type="button"
									onClick={() => create(meta.type, close)}
									className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
								>
									<Icon className="size-3.5 shrink-0" />
									<span className="min-w-0 flex-1 truncate">{meta.label}</span>
								</button>
							);
						})}
					</div>
				</div>
			)}
		</NotePropertiesPopover>
	);
}

export function TemplatePicker({
	customTemplates,
	canSaveCurrent,
	onApply,
	onApplyCustom,
	onSaveCurrent,
	onDeleteCustom,
}: {
	customTemplates: CustomNotePropertyTemplate[];
	canSaveCurrent: boolean;
	onApply: (template: NotePropertyTemplate) => void;
	onApplyCustom: (template: CustomNotePropertyTemplate) => void;
	onSaveCurrent: (name: string) => void;
	onDeleteCustom: (id: string) => void;
}) {
	const iconRef = useRef<AnimatedIconHandle>(null);
	return (
		<NotePropertiesPopover
			trigger={({ toggle }) => (
				<button
					type="button"
					onClick={toggle}
					onMouseEnter={() => iconRef.current?.startAnimation()}
					onMouseLeave={() => iconRef.current?.stopAnimation()}
					className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
				>
					<LayoutDashboardIcon ref={iconRef} size={14} />
					Templates
				</button>
			)}
		>
			{({ close }) => (
				<div className="w-52 p-1">
					<p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/55">
						Replace properties with
					</p>
					<div className="max-h-64 overflow-y-auto">
						{NOTE_PROPERTY_TEMPLATES.map((template) => (
							<button
								key={template.id}
								type="button"
								onClick={() => {
									onApply(template);
									close();
								}}
								className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
							>
								<span className="min-w-0 flex-1 truncate">{template.name}</span>
							</button>
						))}

						{customTemplates.length > 0 ? (
							<>
								<div className="my-1 h-px bg-border/60" />
								<p className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/55">
									My templates
								</p>
								{customTemplates.map((template) => (
									<div
										key={template.id}
										className="group/template flex items-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
									>
										<button
											type="button"
											onClick={() => {
												onApplyCustom(template);
												close();
											}}
											className="flex min-w-0 flex-1 items-center rounded-md px-2 py-1.5 text-left text-xs font-medium outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
										>
											<span className="min-w-0 flex-1 truncate">
												{template.name}
											</span>
										</button>
										<button
											type="button"
											onClick={() => onDeleteCustom(template.id)}
											aria-label={`Delete ${template.name}`}
											className="mr-1 rounded p-1 text-muted-foreground/60 transition-opacity hover:text-foreground md:opacity-0 md:group-hover/template:opacity-100 md:focus-visible:opacity-100"
										>
											<Trash2 className="size-3" />
										</button>
									</div>
								))}
							</>
						) : null}
					</div>

					<div className="my-1 h-px bg-border/60" />
					<SaveTemplateField disabled={!canSaveCurrent} onSave={onSaveCurrent} />
				</div>
			)}
		</NotePropertiesPopover>
	);
}

function SaveTemplateField({
	disabled,
	onSave,
}: {
	disabled: boolean;
	onSave: (name: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");

	function save() {
		const trimmed = name.trim();
		if (!trimmed) return;
		onSave(trimmed);
		setName("");
		setOpen(false);
	}

	if (disabled) {
		return (
			<p className="px-2 py-1.5 text-[11px] text-muted-foreground/45">
				Add a property to save a template
			</p>
		);
	}

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
			>
				<AnimatedPlusIcon size={14} className="skriuw-animated-icon" />
				Save current as template
			</button>
		);
	}

	return (
		<div className="flex items-center gap-1 px-1 py-1">
			<input
				aria-label="Template name"
				// react-doctor-disable-next-line react-doctor/no-autofocus -- popover input should receive focus on open.
				autoFocus
				value={name}
				placeholder="Template name..."
				onChange={(event) => setName(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						save();
					}
					if (event.key === "Escape") {
						event.preventDefault();
						setOpen(false);
					}
				}}
				className="min-w-0 flex-1 rounded-md bg-accent/70 px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/55 focus-visible:ring-1 focus-visible:ring-ring/45"
			/>
			<button
				type="button"
				onClick={save}
				disabled={!name.trim()}
				className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-40"
				aria-label="Save template"
			>
				<Check className="size-3.5" />
			</button>
		</div>
	);
}
