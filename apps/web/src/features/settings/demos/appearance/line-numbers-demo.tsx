"use client";

import { DemoFrame } from "../demo-frame";

type LineNumbersDemoProps = {
	enabled: boolean;
};

const SAMPLE_LINES = ["# Draft note", "Capture ideas quickly.", "Keep writing."];

export function LineNumbersDemo({ enabled }: LineNumbersDemoProps) {
	return (
		<DemoFrame title="Preview" status={enabled ? "Gutter on" : "Gutter off"}>
			<div className="rounded-sm border border-border/60 bg-background px-2 py-2">
				<div className={enabled ? "flex items-start gap-2" : undefined}>
					{enabled ? (
						<div
							aria-hidden="true"
							className="select-none pt-px text-right font-mono text-[10px] leading-5 text-muted-foreground/45"
						>
							{SAMPLE_LINES.map((_, index) => (
								<div key={index + 1}>{index + 1}</div>
							))}
						</div>
					) : null}
					<div className="min-w-0 flex-1 font-mono text-[10px] leading-5 text-foreground/88">
						{SAMPLE_LINES.map((line) => (
							<div key={line}>{line}</div>
						))}
					</div>
				</div>
			</div>
		</DemoFrame>
	);
}
