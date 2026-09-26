"use client";
/* eslint-disable */

import { useState } from "react";
import { Check, Plus, Star } from "lucide-react";
import {
	NOTE_PROPERTY_COLOR_KEYS,
	createNotePropertyId,
	type NoteProperty,
	type NotePropertyColor,
	type NotePropertyOption,
} from "@/domain/notes/properties";
import type { Person } from "@/domain/people/models";
import { useWorkspacePeople } from "@/features/people/hooks/use-people";
import { useCreatePerson } from "@/features/people/hooks/use-create-person";
import { noop } from "@/shared/lib/noop";
import { Avatar, Pill } from "./primitives";
import { NotePropertiesPopover } from "./popover";
import { submitPropertyField, valueDisplayKeys } from "./keyboard";

type Patch = Partial<Pick<NoteProperty, "value" | "options">>;

type EditorProps = {
	property: NoteProperty;
	onUpdate: (patch: Patch) => void;
	density?: "default" | "inline";
};

const FIELD_CLASS =
	"w-full rounded-md bg-transparent px-1.5 py-0.5 text-[15px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus-visible:bg-accent/70 focus-visible:ring-1 focus-visible:ring-ring/45";
const POPOVER_INPUT_CLASS =
	"mb-1.5 w-full rounded-md bg-accent px-2.5 py-1.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-ring/50";
const VALUE_BUTTON_FOCUS_CLASS =
	"outline-none focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background";

function asString(value: NoteProperty["value"]): string {
	return typeof value === "string" ? value : "";
}

function TextLike({
	property,
	onUpdate,
	placeholder,
	type = "text",
}: EditorProps & { placeholder: string; type?: string }) {
	return (
		<input
			data-note-property-field
			type={type}
			value={asString(property.value)}
			placeholder={placeholder}
			onChange={(event) => onUpdate({ value: event.target.value })}
			onKeyDown={submitPropertyField}
			className={FIELD_CLASS}
		/>
	);
}

function NumberEditor({ property, onUpdate }: EditorProps) {
	return (
		<input
			data-note-property-field
			type="number"
			value={
				property.value === null || property.value === undefined
					? ""
					: String(property.value)
			}
			placeholder="Empty"
			onChange={(event) =>
				onUpdate({ value: event.target.value === "" ? null : Number(event.target.value) })
			}
			onKeyDown={submitPropertyField}
			className={FIELD_CLASS}
		/>
	);
}

function DateEditor({ property, onUpdate }: EditorProps) {
	return (
		<input
			data-note-property-field
			type="date"
			value={asString(property.value)}
			onChange={(event) => onUpdate({ value: event.target.value })}
			onKeyDown={submitPropertyField}
			className={`${FIELD_CLASS} [color-scheme:dark]`}
		/>
	);
}

function CheckboxEditor({ property, onUpdate }: EditorProps) {
	const checked = property.value === true;
	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={checked}
			onClick={() => onUpdate({ value: !checked })}
			className={`flex size-[18px] items-center justify-center rounded-[5px] border transition-colors ${VALUE_BUTTON_FOCUS_CLASS} ${
				checked
					? "border-transparent bg-primary text-primary-foreground"
					: "border-border hover:bg-accent"
			}`}
		>
			{checked ? <Check className="size-3" strokeWidth={3} /> : null}
		</button>
	);
}

function RatingEditor({ property, onUpdate }: EditorProps) {
	const value = typeof property.value === "number" ? property.value : 0;
	const [hover, setHover] = useState(0);
	return (
		<div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
			{[1, 2, 3, 4, 5].map((rating) => {
				const active = (hover || value) >= rating;
				return (
					<button
						key={rating}
						type="button"
						aria-label={`${rating} star${rating > 1 ? "s" : ""}`}
						onMouseEnter={() => setHover(rating)}
						onClick={() => onUpdate({ value: value === rating ? null : rating })}
						className={`rounded p-0.5 ${VALUE_BUTTON_FOCUS_CLASS}`}
					>
						<Star
							className={`size-[18px] transition-colors ${active ? "text-amber-400" : "text-muted-foreground/40"}`}
							fill={active ? "currentColor" : "none"}
						/>
					</button>
				);
			})}
		</div>
	);
}

function nextColor(options: NotePropertyOption[]) {
	return NOTE_PROPERTY_COLOR_KEYS[options.length % NOTE_PROPERTY_COLOR_KEYS.length] ?? "gray";
}

const EMPTY_PEOPLE: Person[] = [];

// A person row may not have a stored color (created from a bare `$mention`).
// Fall back to a name-stable swatch so the same person always renders the same
// colour everywhere it appears.
function personColor(person: Pick<Person, "name" | "color">): NotePropertyColor {
	if (person.color) return person.color;
	let hash = 0;
	for (let index = 0; index < person.name.length; index += 1) {
		hash = (hash * 31 + person.name.charCodeAt(index)) >>> 0;
	}
	return NOTE_PROPERTY_COLOR_KEYS[hash % NOTE_PROPERTY_COLOR_KEYS.length] ?? "gray";
}

function OptionPicker({
	property,
	onUpdate,
	multi,
	density = "default",
}: EditorProps & { multi: boolean }) {
	const options = property.options ?? [];
	const selected = multi
		? Array.isArray(property.value)
			? property.value
			: []
		: property.value
			? [property.value as string]
			: [];
	const [query, setQuery] = useState("");

	function toggle(id: string) {
		if (multi) {
			const set = new Set(selected);
			if (set.has(id)) {
				set.delete(id);
			} else {
				set.add(id);
			}
			onUpdate({ value: Array.from(set) });
			return;
		}
		onUpdate({ value: selected[0] === id ? "" : id });
	}

	function createOption() {
		const label = query.trim();
		if (!label) return;
		const option: NotePropertyOption = {
			id: createNotePropertyId("opt"),
			label,
			color: nextColor(options),
		};
		const nextOptions = [...options, option];
		setQuery("");
		if (multi) {
			onUpdate({ options: nextOptions, value: [...selected, option.id] });
			return;
		}
		onUpdate({ options: nextOptions, value: option.id });
	}

	const normalizedQuery = query.toLowerCase().trim();
	const filtered = options.filter((option) =>
		option.label.toLowerCase().includes(normalizedQuery),
	);
	const exact = options.some((option) => option.label.toLowerCase() === normalizedQuery);
	const selectedOptions = options.filter((option) => selected.includes(option.id));
	const inline = density === "inline";
	const visibleInlineOptions = selectedOptions.slice(0, multi ? 2 : 1);
	const hiddenInlineCount = selectedOptions.length - visibleInlineOptions.length;

	return (
		<NotePropertiesPopover
			trigger={({ toggle: togglePopover }) => (
				<button
					type="button"
					data-note-property-field
					onClick={togglePopover}
					onKeyDown={valueDisplayKeys({
						onEdit: togglePopover,
						onClear: () => onUpdate({ value: multi ? [] : "" }),
					})}
					className={
						inline
							? `inline-flex min-h-6 max-w-[18rem] items-center gap-1 overflow-hidden rounded-md px-0.5 py-0 text-left transition-colors hover:bg-accent/50 ${VALUE_BUTTON_FOCUS_CLASS}`
							: `flex min-h-7 w-full flex-wrap items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-accent/50 ${VALUE_BUTTON_FOCUS_CLASS}`
					}
				>
					{selectedOptions.length > 0 ? (
						inline ? (
							<>
								{visibleInlineOptions.map((option) => (
									<Pill
										key={option.id}
										label={option.label}
										color={option.color}
										dot
									/>
								))}
								{hiddenInlineCount > 0 ? (
									<span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[12px] font-medium leading-5 text-muted-foreground">
										+{hiddenInlineCount}
									</span>
								) : null}
							</>
						) : (
							selectedOptions.map((option) => (
								<Pill
									key={option.id}
									label={option.label}
									color={option.color}
									dot
								/>
							))
						)
					) : (
						<span
							className={
								inline
									? "px-1 text-[13px] text-muted-foreground/60"
									: "px-1 text-[15px] text-muted-foreground/60"
							}
						>
							Empty
						</span>
					)}
				</button>
			)}
		>
			{() => (
				<div className="w-60 p-1.5">
					<input
						autoFocus
						value={query}
						placeholder="Search or create..."
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !exact && query.trim()) createOption();
						}}
						className={POPOVER_INPUT_CLASS}
					/>
					<div className="max-h-56 overflow-y-auto">
						{filtered.map((option) => (
							<button
								key={option.id}
								type="button"
								onClick={() => toggle(option.id)}
								className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-ring/50"
							>
								<Pill label={option.label} color={option.color} dot />
								{selected.includes(option.id) ? (
									<Check className="size-4 text-muted-foreground" />
								) : null}
							</button>
						))}
						{query.trim() && !exact ? (
							<button
								type="button"
								onClick={createOption}
								className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-ring/50"
							>
								<Plus className="size-3.5" />
								Create
								<Pill label={query.trim()} color={nextColor(options)} dot />
							</button>
						) : null}
						{filtered.length === 0 && !query.trim() ? (
							<p className="px-1.5 py-2 text-sm text-muted-foreground/60">
								No options yet
							</p>
						) : null}
					</div>
				</div>
			)}
		</NotePropertiesPopover>
	);
}

function PersonEditor({ property, onUpdate, density = "default" }: EditorProps) {
	const peopleQuery = useWorkspacePeople();
	const directory = peopleQuery.data ?? EMPTY_PEOPLE;
	const createPersonMutation = useCreatePerson();
	const selected = Array.isArray(property.value) ? property.value : [];
	const [query, setQuery] = useState("");

	function toggle(id: string) {
		const set = new Set(selected);
		if (set.has(id)) {
			set.delete(id);
		} else {
			set.add(id);
		}
		onUpdate({ value: Array.from(set) });
	}

	async function createPerson() {
		const name = query.trim();
		if (!name) return;
		setQuery("");

		const existing = directory.find(
			(person) => person.name.toLowerCase() === name.toLowerCase(),
		);
		if (existing) {
			if (!selected.includes(existing.id)) onUpdate({ value: [...selected, existing.id] });
			return;
		}

		try {
			const person = await createPersonMutation.mutateAsync({
				id: crypto.randomUUID(),
				name,
				color: personColor({ name, color: null }),
			});
			onUpdate({ value: [...selected, person.id] });
		} catch {
			noop();
		}
	}

	const normalizedQuery = query.toLowerCase().trim();
	const people = directory.filter((person) =>
		person.name.toLowerCase().includes(normalizedQuery),
	);
	const exact = directory.some((person) => person.name.toLowerCase() === normalizedQuery);
	const selectedPeople = directory.filter((person) => selected.includes(person.id));
	const inline = density === "inline";
	const visibleInlinePeople = selectedPeople.slice(0, 2);
	const hiddenInlineCount = selectedPeople.length - visibleInlinePeople.length;

	return (
		<NotePropertiesPopover
			trigger={({ toggle: togglePopover }) => (
				<button
					type="button"
					data-note-property-field
					onClick={togglePopover}
					onKeyDown={valueDisplayKeys({
						onEdit: togglePopover,
						onClear: () => onUpdate({ value: [] }),
					})}
					className={
						inline
							? `inline-flex min-h-6 max-w-[18rem] items-center gap-1 overflow-hidden rounded-md px-0.5 py-0 text-left transition-colors hover:bg-accent/50 ${VALUE_BUTTON_FOCUS_CLASS}`
							: `flex min-h-7 w-full flex-wrap items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-accent/50 ${VALUE_BUTTON_FOCUS_CLASS}`
					}
				>
					{selectedPeople.length > 0 ? (
						(inline ? visibleInlinePeople : selectedPeople).map((person) => (
							<span
								key={person.id}
								className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-accent py-0.5 pl-0.5 pr-2 text-[13px]"
							>
								<Avatar name={person.name} color={personColor(person)} />
								<span className="truncate">{person.name}</span>
							</span>
						))
					) : (
						<span
							className={
								inline
									? "px-1 text-[13px] text-muted-foreground/60"
									: "px-1 text-[15px] text-muted-foreground/60"
							}
						>
							Empty
						</span>
					)}
					{hiddenInlineCount > 0 ? (
						<span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[12px] font-medium leading-5 text-muted-foreground">
							+{hiddenInlineCount}
						</span>
					) : null}
				</button>
			)}
		>
			{() => (
				<div className="w-60 p-1.5">
					<input
						autoFocus
						value={query}
						placeholder="Search or add a person..."
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !exact && query.trim()) createPerson();
						}}
						className={POPOVER_INPUT_CLASS}
					/>
					<div className="max-h-56 overflow-y-auto">
						{people.map((person) => (
							<button
								key={person.id}
								type="button"
								onClick={() => toggle(person.id)}
								className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1.5 outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-ring/50"
							>
								<span className="flex items-center gap-2 text-sm">
									<Avatar
										name={person.name}
										color={personColor(person)}
										size={22}
									/>
									{person.name}
								</span>
								{selected.includes(person.id) ? (
									<Check className="size-4 text-muted-foreground" />
								) : null}
							</button>
						))}
						{query.trim() && !exact ? (
							<button
								type="button"
								onClick={createPerson}
								className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-ring/50"
							>
								<Plus className="size-3.5" />
								Add
								<span className="flex items-center gap-1.5">
									<Avatar
										name={query.trim()}
										color={personColor({ name: query.trim(), color: null })}
										size={22}
									/>
									{query.trim()}
								</span>
							</button>
						) : null}
						{people.length === 0 && !query.trim() ? (
							<p className="px-1.5 py-2 text-sm text-muted-foreground/60">
								No people yet
							</p>
						) : null}
					</div>
				</div>
			)}
		</NotePropertiesPopover>
	);
}

function UrlEditor({ property, onUpdate }: EditorProps) {
	const value = asString(property.value);
	const [editing, setEditing] = useState(false);
	if (value && !editing) {
		return (
			<a
				data-note-property-field
				href={value.startsWith("http") ? value : `https://${value}`}
				target="_blank"
				rel="noreferrer"
				onClick={(event) => {
					if (event.metaKey || event.ctrlKey) return;
					event.preventDefault();
					setEditing(true);
				}}
				onKeyDown={valueDisplayKeys({
					onEdit: () => setEditing(true),
					onClear: () => {
						onUpdate({ value: "" });
						setEditing(true);
					},
				})}
				className="block min-w-0 flex-1 truncate text-[15px] text-blue-400 underline decoration-blue-400/40 underline-offset-2 hover:decoration-blue-400"
			>
				{value}
			</a>
		);
	}
	return (
		<input
			data-note-property-field
			autoFocus={editing}
			type="url"
			value={value}
			placeholder="https://..."
			onChange={(event) => onUpdate({ value: event.target.value })}
			onKeyDown={submitPropertyField}
			onBlur={() => setEditing(false)}
			className={FIELD_CLASS}
		/>
	);
}

export function ValueEditor({ property, onUpdate, density = "default" }: EditorProps) {
	switch (property.type) {
		case "number":
			return <NumberEditor property={property} onUpdate={onUpdate} />;
		case "date":
			return <DateEditor property={property} onUpdate={onUpdate} />;
		case "checkbox":
			return <CheckboxEditor property={property} onUpdate={onUpdate} />;
		case "rating":
			return <RatingEditor property={property} onUpdate={onUpdate} />;
		case "select":
			return (
				<OptionPicker
					property={property}
					onUpdate={onUpdate}
					multi={false}
					density={density}
				/>
			);
		case "multi-select":
			return <OptionPicker property={property} onUpdate={onUpdate} multi density={density} />;
		case "person":
			return <PersonEditor property={property} onUpdate={onUpdate} density={density} />;
		case "url":
			return <UrlEditor property={property} onUpdate={onUpdate} />;
		case "email":
			return (
				<TextLike
					property={property}
					onUpdate={onUpdate}
					placeholder="name@email.com"
					type="email"
				/>
			);
		case "phone":
			return (
				<TextLike
					property={property}
					onUpdate={onUpdate}
					placeholder="+31 6 ..."
					type="tel"
				/>
			);
		case "location":
			return <TextLike property={property} onUpdate={onUpdate} placeholder="Add a place" />;
		default:
			return <TextLike property={property} onUpdate={onUpdate} placeholder="Empty" />;
	}
}
