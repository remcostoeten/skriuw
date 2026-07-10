"use client";

import { useMemo } from "react";
import { format, subDays, isAfter, startOfDay } from "date-fns";
import { Calendar, Hash, Target, Zap, Heart, Download, FileText } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
	type MoodLevel,
	type Mood,
	type JournalEntry,
	type JournalTag,
	MOOD_OPTIONS,
} from "@/features/journal/types";
import { useJournalEntries } from "../hooks/use-journal-entries";
import { useJournalTags } from "../hooks/use-journal-tags";

type Props = {
	className?: string;
};

type JournalStatsData = {
	totalEntries: number;
	todayEntries: number;
	yesterdayEntries: number;
	lastWeekEntries: number;
	lastMonthEntries: number;
	currentStreak: number;
	longestStreak: number;
	moodCounts: Partial<Record<MoodLevel, number>>;
	totalWords: number;
	tagUsage: JournalTag[];
	heatmap: { date: Date; dateKey: string; hasEntry: boolean }[];
	mostCommonMood: Mood | null;
};

function getStreakColor(streak: number) {
	if (streak >= 30) return "text-mood-great";
	if (streak >= 14) return "text-mood-good";
	if (streak >= 7) return "text-status-completed";
	if (streak >= 3) return "text-mood-low";
	return "text-muted-foreground";
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => {
		switch (char) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			case "'":
				return "&#39;";
			default:
				return char;
		}
	});
}

function useJournalStats(entries: JournalEntry[], tags: JournalTag[]): JournalStatsData {
	return useMemo(() => {
		const now = new Date();
		const today = startOfDay(now);
		const yesterday = startOfDay(subDays(now, 1));
		const lastWeek = startOfDay(subDays(now, 7));
		const lastMonth = startOfDay(subDays(now, 30));

		const todayKey = format(today, "yyyy-MM-dd");
		const yesterdayKey = format(yesterday, "yyyy-MM-dd");

		const todayEntries = entries.filter((e) => e.dateKey === todayKey);
		const yesterdayEntries = entries.filter((e) => e.dateKey === yesterdayKey);
		const lastWeekEntries = entries.filter((e) => isAfter(new Date(e.dateKey), lastWeek));
		const lastMonthEntries = entries.filter((e) => isAfter(new Date(e.dateKey), lastMonth));

		// Streak calculation
		const sortedEntries = entries.toSorted((a, b) => b.dateKey.localeCompare(a.dateKey));
		let currentStreak = 0;
		let longestStreak = 0;
		let tempStreak = 0;
		let lastDate: Date | null = null;

		sortedEntries.forEach((entry, index) => {
			const entryDate = new Date(entry.dateKey);
			if (index === 0) {
				tempStreak = 1;
				lastDate = entryDate;
			} else {
				const daysDiff = Math.floor(
					(lastDate!.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24),
				);
				if (daysDiff === 1) {
					tempStreak++;
				} else {
					longestStreak = Math.max(longestStreak, tempStreak);
					tempStreak = 1;
				}
				lastDate = entryDate;
			}
		});

		longestStreak = Math.max(longestStreak, tempStreak);

		// Check if today has entry to continue streak
		const todayEntry = todayEntries.length > 0;
		const yesterdayEntry = yesterdayEntries.length > 0;

		if (todayEntry) {
			currentStreak = tempStreak;
		} else if (yesterdayEntry) {
			currentStreak = tempStreak - 1;
		} else {
			currentStreak = 0;
		}

		// Mood stats
		const moodCounts: Partial<Record<MoodLevel, number>> = {};
		for (const entry of entries) {
			if (entry.mood) {
				moodCounts[entry.mood] = (moodCounts[entry.mood] ?? 0) + 1;
			}
		}

		// Word count
		const totalWords = entries.reduce((acc, entry) => {
			const trimmed = entry.content.trim();
			return acc + (trimmed ? trimmed.split(/\s+/).length : 0);
		}, 0);

		// Tag usage
		const tagUsage = tags.slice(0, 5);

		// Activity heatmap (last 30 days)
		const entryDateSet = new Set(entries.map((e) => e.dateKey as string));
		const heatmap = [];
		for (let i = 29; i >= 0; i--) {
			const date = startOfDay(subDays(now, i));
			const dateKey = format(date, "yyyy-MM-dd");
			heatmap.push({ date, dateKey, hasEntry: entryDateSet.has(dateKey) });
		}

		// Most common mood (computed once, not per-render)
		const moodEntries = Object.entries(moodCounts) as [MoodLevel, number][];
		const mostCommonMood: Mood | null =
			moodEntries.length > 0
				? MOOD_OPTIONS[moodEntries.sort((a, b) => b[1] - a[1])[0][0]]
				: null;

		return {
			totalEntries: entries.length,
			todayEntries: todayEntries.length,
			yesterdayEntries: yesterdayEntries.length,
			lastWeekEntries: lastWeekEntries.length,
			lastMonthEntries: lastMonthEntries.length,
			currentStreak,
			longestStreak,
			moodCounts,
			totalWords,
			tagUsage,
			heatmap,
			mostCommonMood,
		};
	}, [entries, tags]);
}

function useJournalExports(entries: JournalEntry[], tags: JournalTag[], stats: JournalStatsData) {
	function exportAsMarkdown() {
		const sortedEntries = entries.toSorted((a, b) => b.dateKey.localeCompare(a.dateKey));
		let markdown = "# Journal Export\n\n";
		markdown += `Exported on ${format(new Date(), "MMMM d, yyyy")}\n\n`;
		markdown += `Total entries: ${sortedEntries.length}\n\n`;
		markdown += "---\n\n";

		sortedEntries.forEach((entry) => {
			const date = new Date(entry.dateKey + "T00:00:00");
			markdown += `## ${format(date, "EEEE, MMMM d, yyyy")}\n\n`;

			if (entry.mood) {
				const mood = MOOD_OPTIONS[entry.mood];
				markdown += `**Mood:** ${mood.icon} ${mood.label}\n\n`;
			}

			if (entry.tags.length > 0) {
				markdown += `**Tags:** ${entry.tags.map((tag) => `@${tag}`).join(", ")}\n\n`;
			}

			markdown += `${entry.content || "*No content*"}\n\n---\n\n`;
		});

		const blob = new Blob([markdown], { type: "text/markdown" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `journal-export-${format(new Date(), "yyyy-MM-dd")}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function exportAsJSON() {
		const exportData = {
			exportedAt: new Date().toISOString(),
			entries: entries,
			tags: tags,
			stats: {
				totalEntries: stats.totalEntries,
				totalWords: stats.totalWords,
				currentStreak: stats.currentStreak,
				longestStreak: stats.longestStreak,
				moodCounts: stats.moodCounts,
			},
		};

		const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `journal-export-${format(new Date(), "yyyy-MM-dd")}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function exportAsPDF() {
		// For PDF export, we'll create a simple HTML version and trigger print
		const sortedEntries = entries.toSorted((a, b) => b.dateKey.localeCompare(a.dateKey));
		const rootStyles = getComputedStyle(document.documentElement);
		const foreground = rootStyles.getPropertyValue("--foreground").trim() || "0 0% 12%";
		const mutedForeground =
			rootStyles.getPropertyValue("--muted-foreground").trim() || "0 0% 42%";
		const border = rootStyles.getPropertyValue("--border").trim() || "0 0% 88%";
		let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Journal Export</title>
        <style>
          body { font-family: 'Inter', sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
          h1 { color: hsl(${foreground}); }
          h2 { color: hsl(${mutedForeground}); margin-top: 2rem; border-bottom: 1px solid hsl(${border}); padding-bottom: 0.5rem; }
          .mood { color: hsl(${mutedForeground}); font-size: 0.9em; }
          .tags { color: hsl(${mutedForeground}); font-size: 0.9em; }
          .content { white-space: pre-wrap; margin: 1rem 0; }
          .entry { margin-bottom: 2rem; page-break-inside: avoid; }
          @media print { body { padding: 1rem; } }
        </style>
      </head>
      <body>
        <h1>Journal Export</h1>
        <p>Exported on ${format(new Date(), "MMMM d, yyyy")}</p>
        <p>Total entries: ${sortedEntries.length}</p>
        <hr>
    `;

		sortedEntries.forEach((entry) => {
			const date = new Date(entry.dateKey + "T00:00:00");
			html += `
        <div class="entry">
          <h2>${format(date, "EEEE, MMMM d, yyyy")}</h2>
      `;

			if (entry.mood) {
				const mood = MOOD_OPTIONS[entry.mood];
				html += `<p class="mood">Mood: ${escapeHtml(mood.icon)} ${escapeHtml(mood.label)}</p>`;
			}

			if (entry.tags.length > 0) {
				html += `<p class="tags">Tags: ${entry.tags.map((tag) => `@${escapeHtml(tag)}`).join(", ")}</p>`;
			}

			html += `<div class="content">${escapeHtml(entry.content || "No content")}</div></div>`;
		});

		html += "</body></html>";

		const blob = new Blob([html], { type: "text/html" });
		const url = URL.createObjectURL(blob);
		const printWindow = window.open(url, "_blank");
		if (printWindow) {
			printWindow.addEventListener(
				"load",
				() => {
					printWindow.focus();
					printWindow.print();
					URL.revokeObjectURL(url);
				},
				{ once: true },
			);
		} else {
			URL.revokeObjectURL(url);
		}
	}

	return { exportAsMarkdown, exportAsJSON, exportAsPDF };
}

function EntryStatsSection({ stats }: { stats: JournalStatsData }) {
	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-1.5">
				<Calendar className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
				<span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
					Entries
				</span>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<div className="border border-border bg-background p-2">
					<p className="text-[18px] font-bold text-foreground">{stats.totalEntries}</p>
					<p className="text-[9px] text-muted-foreground/60">Total</p>
				</div>
				<div className="border border-border bg-background p-2">
					<p className="text-[18px] font-bold text-foreground">{stats.todayEntries}</p>
					<p className="text-[9px] text-muted-foreground/60">Today</p>
				</div>
			</div>

			<div className="space-y-1.5">
				<div className="flex justify-between text-[10px]">
					<span className="text-muted-foreground/60">Last 7 days</span>
					<span className="font-medium text-foreground">{stats.lastWeekEntries}</span>
				</div>
				<div className="flex justify-between text-[10px]">
					<span className="text-muted-foreground/60">Last 30 days</span>
					<span className="font-medium text-foreground">{stats.lastMonthEntries}</span>
				</div>
				<div className="flex justify-between text-[10px]">
					<span className="text-muted-foreground/60">Total words</span>
					<span className="font-medium text-foreground">
						{stats.totalWords.toLocaleString()}
					</span>
				</div>
			</div>
		</div>
	);
}

function StreaksSection({ stats }: { stats: JournalStatsData }) {
	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-1.5">
				<Zap className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
				<span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
					Streaks
				</span>
			</div>

			<div className="space-y-1.5">
				<div className="flex justify-between">
					<span className="text-[10px] text-muted-foreground/60">Current</span>
					<span
						className={cn("text-[12px] font-bold", getStreakColor(stats.currentStreak))}
					>
						{stats.currentStreak} {stats.currentStreak === 1 ? "day" : "days"}
					</span>
				</div>
				<div className="flex justify-between">
					<span className="text-[10px] text-muted-foreground/60">Longest</span>
					<span className="text-[12px] font-bold text-foreground">
						{stats.longestStreak} {stats.longestStreak === 1 ? "day" : "days"}
					</span>
				</div>
			</div>
		</div>
	);
}

function MoodSection({ stats }: { stats: JournalStatsData }) {
	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-1.5">
				<Heart className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
				<span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
					Mood
				</span>
			</div>

			{stats.mostCommonMood && (
				<div className="border border-border bg-background p-2">
					<p className="text-[10px] text-muted-foreground/60">Most common</p>
					<p className="text-[12px] font-bold text-foreground mt-0.5">
						{stats.mostCommonMood.icon} {stats.mostCommonMood.label}
					</p>
				</div>
			)}

			<div className="space-y-1">
				{(Object.entries(stats.moodCounts) as [MoodLevel, number][]).map(
					([mood, count]) => (
						<div key={mood} className="flex items-center gap-1.5">
							<span className={cn("text-[10px]", MOOD_OPTIONS[mood].color)}>
								{MOOD_OPTIONS[mood].icon}
							</span>
							<span className="text-[10px] text-muted-foreground/60">
								{MOOD_OPTIONS[mood].label}
							</span>
							<span className="ml-auto text-[10px] font-medium text-foreground">
								{count}
							</span>
						</div>
					),
				)}
			</div>
		</div>
	);
}

function TopTagsSection({ tagUsage }: { tagUsage: JournalTag[] }) {
	if (tagUsage.length === 0) return null;

	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-1.5">
				<Hash className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
				<span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
					Top Tags
				</span>
			</div>

			<div className="space-y-1">
				{tagUsage.map((tag) => (
					<div key={tag.id} className="flex items-center gap-1.5">
						<span
							className="h-1.5 w-1.5 rounded-full"
							style={{ backgroundColor: tag.color }}
						/>
						<span className="text-[10px] text-muted-foreground/60">@{tag.name}</span>
						<span className="ml-auto text-[10px] font-medium text-foreground">
							{tag.usageCount}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function ActivityHeatmapSection({ heatmap }: { heatmap: JournalStatsData["heatmap"] }) {
	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-1.5">
				<Target className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
				<span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
					Activity (30 days)
				</span>
			</div>

			<div className="grid grid-cols-7 gap-0.5">
				{heatmap.map((day) => (
					<div
						key={day.dateKey}
						className={cn(
							"aspect-square border",
							day.hasEntry
								? "border-status-planned bg-status-planned"
								: "border-border bg-background",
						)}
						aria-label={`${format(day.date, "MMM d")}${day.hasEntry ? " - Entry" : " - No entry"}`}
					/>
				))}
			</div>

			<div className="flex items-center justify-between text-[8px] text-muted-foreground/40">
				<span>30 days ago</span>
				<span>Today</span>
			</div>
		</div>
	);
}

function ExportSection({
	onExportMarkdown,
	onExportJSON,
	onExportPDF,
}: {
	onExportMarkdown: () => void;
	onExportJSON: () => void;
	onExportPDF: () => void;
}) {
	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-1.5">
				<Download className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
				<span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
					Export
				</span>
			</div>

			<div className="space-y-1.5">
				<button
					type="button"
					onClick={onExportMarkdown}
					className="flex w-full items-center gap-1.5 border border-border bg-background px-2 py-1.5 text-[10px] text-foreground transition-colors hover:bg-muted"
				>
					<FileText className="h-3 w-3" strokeWidth={1.5} />
					Markdown
				</button>

				<button
					type="button"
					onClick={onExportJSON}
					className="flex w-full items-center gap-1.5 border border-border bg-background px-2 py-1.5 text-[10px] text-foreground transition-colors hover:bg-muted"
				>
					<Download className="h-3 w-3" strokeWidth={1.5} />
					JSON
				</button>

				<button
					type="button"
					onClick={onExportPDF}
					className="flex w-full items-center gap-1.5 border border-border bg-background px-2 py-1.5 text-[10px] text-foreground transition-colors hover:bg-muted"
				>
					<FileText className="h-3 w-3" strokeWidth={1.5} />
					Print / PDF
				</button>
			</div>

			<p className="text-[8px] text-muted-foreground/40">Export for backup or sharing</p>
		</div>
	);
}

export function JournalStats({ className }: Props) {
	const { data: entries = [] } = useJournalEntries();
	const { data: tags = [] } = useJournalTags();

	const stats = useJournalStats(entries, tags);
	const { exportAsMarkdown, exportAsJSON, exportAsPDF } = useJournalExports(entries, tags, stats);

	return (
		<div className={cn("p-2 space-y-4", className)}>
			{/* Entry Stats */}
			<EntryStatsSection stats={stats} />

			{/* Streaks */}
			<StreaksSection stats={stats} />

			{/* Mood Analysis */}
			<MoodSection stats={stats} />

			{/* Top Tags */}
			<TopTagsSection tagUsage={stats.tagUsage} />

			{/* Activity Heatmap */}
			<ActivityHeatmapSection heatmap={stats.heatmap} />

			{/* Export Options */}
			<ExportSection
				onExportMarkdown={exportAsMarkdown}
				onExportJSON={exportAsJSON}
				onExportPDF={exportAsPDF}
			/>
		</div>
	);
}
