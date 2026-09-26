"use client";

import { useState } from "react";
import { Mark, type MarkKind } from "./live-note-demo";

type Segment = {
	text: string;
	kind?: MarkKind;
};

const TOKEN =
	/(\[\[[^\]]+\]\])|(#[\w-]+)|(\$[A-Za-z][\w-]*)|([€$]\s?\d[\d.,]*)|(\b\d{1,2}:\d{2}\b|\b(?:today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)|(\b\d+\s+(?:bugs?|items?|tasks?|notes?|people|days?|words?)\b)/gi;

const GROUP_KINDS: MarkKind[] = ["link", "tag", "person", "amount", "date", "count"];

function parseMarks(text: string): Segment[] {
	const segments: Segment[] = [];
	let last = 0;
	for (const match of text.matchAll(TOKEN)) {
		const index = match.index ?? 0;
		if (index > last) segments.push({ text: text.slice(last, index) });
		const groupIndex = match.slice(1).findIndex((g) => g !== undefined);
		segments.push({ text: match[0], kind: GROUP_KINDS[groupIndex] });
		last = index + match[0].length;
	}
	if (last < text.length) segments.push({ text: text.slice(last) });
	return segments;
}

export function MarkPlayground() {
	const [value, setValue] = useState("dinner with $sam friday 19:00 — bring €25 #plans");
	const segments = parseMarks(value);
	const found = segments.filter((s) => s.kind).length;

	return (
		<div className="w-full border border-border">
			<div className="flex items-center justify-between border-b border-border px-4 py-2.5">
				<label
					htmlFor="mark-playground"
					className="font-mono text-xs text-muted-foreground"
				>
					your turn — type anything
				</label>
				<span className="font-mono text-xs text-muted-foreground">
					{found} {found === 1 ? "mark" : "marks"}
				</span>
			</div>
			<input
				id="mark-playground"
				type="text"
				value={value}
				onChange={(event) => setValue(event.target.value)}
				spellCheck={false}
				autoComplete="off"
				className="h-11 w-full border-b border-border bg-transparent px-4 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
				placeholder="coffee with $linde tomorrow 09:30 #planning"
			/>
			<p className="min-h-[3.25rem] px-4 py-3 text-sm leading-7 text-foreground">
				{value.trim() === "" ? (
					<span className="text-muted-foreground">
						Mention a person with $, a tag with #, an amount, a time, or a [[note]].
					</span>
				) : (
					segments.map((segment, i) =>
						segment.kind ? (
							<Mark key={i} kind={segment.kind}>
								{segment.text}
							</Mark>
						) : (
							<span key={i}>{segment.text}</span>
						),
					)
				)}
			</p>
		</div>
	);
}
