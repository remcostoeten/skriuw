'use client';

import { useMemo, useCallback } from 'react';
import { format, subDays, isAfter, startOfDay } from 'date-fns';
import { Calendar, Hash, Target, Zap, Heart, Download, FileText } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { type MoodLevel, type Mood, MOOD_OPTIONS } from '@/features/journal/types';
import { useJournalEntries, useJournalTags } from '../hooks/use-journal-queries';

type JournalStatsProps = {
  className?: string;
};

function getStreakColor(streak: number) {
  if (streak >= 30) return 'text-emerald-400';
  if (streak >= 14) return 'text-green-400';
  if (streak >= 7) return 'text-lime-400';
  if (streak >= 3) return 'text-yellow-400';
  return 'text-muted-foreground';
}

export function JournalStats({ className }: JournalStatsProps) {
  const { data: entries = [] } = useJournalEntries();
  const { data: tags = [] } = useJournalTags();

  const stats = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const yesterday = startOfDay(subDays(now, 1));
    const lastWeek = startOfDay(subDays(now, 7));
    const lastMonth = startOfDay(subDays(now, 30));

    const todayKey = format(today, 'yyyy-MM-dd');
    const yesterdayKey = format(yesterday, 'yyyy-MM-dd');

    const todayEntries = entries.filter(e => e.dateKey === todayKey);
    const yesterdayEntries = entries.filter(e => e.dateKey === yesterdayKey);
    const lastWeekEntries = entries.filter(e => isAfter(new Date(e.dateKey), lastWeek));
    const lastMonthEntries = entries.filter(e => isAfter(new Date(e.dateKey), lastMonth));

    // Streak calculation
    const sortedEntries = [...entries].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
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
        const daysDiff = Math.floor((lastDate!.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
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
    const entryDateSet = new Set(entries.map(e => e.dateKey as string));
    const heatmap = [];
    for (let i = 29; i >= 0; i--) {
      const date = startOfDay(subDays(now, i));
      const dateKey = format(date, 'yyyy-MM-dd');
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

  const exportAsMarkdown = useCallback(() => {
    const sortedEntries = [...entries].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    let markdown = '# Journal Export\n\n';
    markdown += `Exported on ${format(new Date(), 'MMMM d, yyyy')}\n\n`;
    markdown += `Total entries: ${sortedEntries.length}\n\n`;
    markdown += '---\n\n';

    sortedEntries.forEach(entry => {
      const date = new Date(entry.dateKey + 'T00:00:00');
      markdown += `## ${format(date, 'EEEE, MMMM d, yyyy')}\n\n`;

      if (entry.mood) {
        const mood = MOOD_OPTIONS[entry.mood];
        markdown += `**Mood:** ${mood.icon} ${mood.label}\n\n`;
      }

      if (entry.tags.length > 0) {
        markdown += `**Tags:** ${entry.tags.map(tag => `@${tag}`).join(', ')}\n\n`;
      }

      markdown += `${entry.content || '*No content*'}\n\n---\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-export-${format(new Date(), 'yyyy-MM-dd')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries]);

  const exportAsJSON = useCallback(() => {
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
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-export-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries, tags, stats]);

  const exportAsPDF = useCallback(() => {
    // For PDF export, we'll create a simple HTML version and trigger print
    const sortedEntries = [...entries].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Journal Export</title>
        <style>
          body { font-family: 'Inter', sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
          h1 { color: #333; }
          h2 { color: #555; margin-top: 2rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
          .mood { color: #666; font-size: 0.9em; }
          .tags { color: #666; font-size: 0.9em; }
          .content { white-space: pre-wrap; margin: 1rem 0; }
          .entry { margin-bottom: 2rem; page-break-inside: avoid; }
          @media print { body { padding: 1rem; } }
        </style>
      </head>
      <body>
        <h1>Journal Export</h1>
        <p>Exported on ${format(new Date(), 'MMMM d, yyyy')}</p>
        <p>Total entries: ${sortedEntries.length}</p>
        <hr>
    `;

    sortedEntries.forEach(entry => {
      const date = new Date(entry.dateKey + 'T00:00:00');
      html += `
        <div class="entry">
          <h2>${format(date, 'EEEE, MMMM d, yyyy')}</h2>
      `;

      if (entry.mood) {
        const mood = MOOD_OPTIONS[entry.mood];
        html += `<p class="mood">Mood: ${mood.icon} ${mood.label}</p>`;
      }

      if (entry.tags.length > 0) {
        html += `<p class="tags">Tags: ${entry.tags.map(tag => `@${tag}`).join(', ')}</p>`;
      }

      html += `<div class="content">${entry.content || 'No content'}</div></div>`;
    });

    html += '</body></html>';

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    }
  }, [entries]);

  return (
    <div className={cn('p-2 space-y-4', className)}>
      {/* Entry Stats */}
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
            <span className="font-medium text-foreground">{stats.totalWords.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Streaks */}
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
            <span className={cn('text-[12px] font-bold', getStreakColor(stats.currentStreak))}>
              {stats.currentStreak} {stats.currentStreak === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] text-muted-foreground/60">Longest</span>
            <span className="text-[12px] font-bold text-foreground">
              {stats.longestStreak} {stats.longestStreak === 1 ? 'day' : 'days'}
            </span>
          </div>
        </div>
      </div>

      {/* Mood Analysis */}
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
          {(Object.entries(stats.moodCounts) as [MoodLevel, number][]).map(([mood, count]) => (
            <div key={mood} className="flex items-center gap-1.5">
              <span className={cn('text-[10px]', MOOD_OPTIONS[mood].color)}>
                {MOOD_OPTIONS[mood].icon}
              </span>
              <span className="text-[10px] text-muted-foreground/60">{MOOD_OPTIONS[mood].label}</span>
              <span className="ml-auto text-[10px] font-medium text-foreground">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Tags */}
      {stats.tagUsage.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
              Top Tags
            </span>
          </div>

          <div className="space-y-1">
            {stats.tagUsage.map((tag) => (
              <div key={tag.id} className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="text-[10px] text-muted-foreground/60">@{tag.name}</span>
                <span className="ml-auto text-[10px] font-medium text-foreground">{tag.usageCount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Heatmap */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
          <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
            Activity (30 days)
          </span>
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {stats.heatmap.map((day) => (
            <div
              key={day.dateKey}
              className={cn(
                'aspect-square border',
                day.hasEntry ? 'border-indigo-400 bg-indigo-400' : 'border-border bg-background'
              )}
              title={`${format(day.date, 'MMM d')}${day.hasEntry ? ' - Entry' : ' - No entry'}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between text-[8px] text-muted-foreground/40">
          <span>30 days ago</span>
          <span>Today</span>
        </div>
      </div>

      {/* Export Options */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Download className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
          <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
            Export
          </span>
        </div>

        <div className="space-y-1.5">
          <button
            onClick={exportAsMarkdown}
            className="flex w-full items-center gap-1.5 border border-border bg-background px-2 py-1.5 text-[10px] text-foreground transition-colors hover:bg-muted"
          >
            <FileText className="h-3 w-3" strokeWidth={1.5} />
            Markdown
          </button>

          <button
            onClick={exportAsJSON}
            className="flex w-full items-center gap-1.5 border border-border bg-background px-2 py-1.5 text-[10px] text-foreground transition-colors hover:bg-muted"
          >
            <Download className="h-3 w-3" strokeWidth={1.5} />
            JSON
          </button>

          <button
            onClick={exportAsPDF}
            className="flex w-full items-center gap-1.5 border border-border bg-background px-2 py-1.5 text-[10px] text-foreground transition-colors hover:bg-muted"
          >
            <FileText className="h-3 w-3" strokeWidth={1.5} />
            Print / PDF
          </button>
        </div>

        <p className="text-[8px] text-muted-foreground/40">
          Export for backup or sharing
        </p>
      </div>
    </div>
  );
}
