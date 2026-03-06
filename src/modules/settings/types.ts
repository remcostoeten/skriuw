export type TemplateStyle = 'simple' | 'notion' | 'journal';

export type ActivityAction = 
  | 'settings_opened'
  | 'note_created'
  | 'template_changed'
  | 'mode_changed'
  | 'diary_toggled';

export type ActivityItem = {
  id: string;
  action: ActivityAction;
  createdAt: Date;
};

export type TemplateTimestamp = {
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  useCount: number;
};

// Saved tag for reuse across notes
export type SavedTag = {
  id: string;
  name: string;
  color: string;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
};

// Predefined tag colors
export const TAG_COLORS = [
  { name: 'Gray', value: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  { name: 'Red', value: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { name: 'Orange', value: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { name: 'Amber', value: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { name: 'Green', value: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { name: 'Teal', value: 'bg-teal-500/20 text-teal-400 border-teal-500/30' },
  { name: 'Blue', value: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { name: 'Purple', value: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { name: 'Pink', value: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
] as const;

export type UserSettings = {
  userId: string;
  templateStyle: TemplateStyle;
  templateTimestamps: Record<TemplateStyle, TemplateTimestamp>;
  savedTags: SavedTag[];
  recentMoods: Array<{ mood: string; date: Date }>;
  defaultPlaceholder: string;
  defaultModeMarkdown: boolean;
  diaryModeEnabled: boolean;
  amountOfNotes: number;
  activity: ActivityItem[];
};

export const DEFAULT_SETTINGS: Omit<UserSettings, 'userId'> = {
  templateStyle: 'simple',
  templateTimestamps: {
    simple: {
      createdAt: new Date(),
      updatedAt: new Date(),
      lastUsedAt: null,
      useCount: 0,
    },
    notion: {
      createdAt: new Date(),
      updatedAt: new Date(),
      lastUsedAt: null,
      useCount: 0,
    },
    journal: {
      createdAt: new Date(),
      updatedAt: new Date(),
      lastUsedAt: null,
      useCount: 0,
    },
  },
  savedTags: [
    { id: 'tag-1', name: 'personal', color: TAG_COLORS[4].value, usageCount: 0, lastUsedAt: null, createdAt: new Date() },
    { id: 'tag-2', name: 'work', color: TAG_COLORS[6].value, usageCount: 0, lastUsedAt: null, createdAt: new Date() },
    { id: 'tag-3', name: 'ideas', color: TAG_COLORS[7].value, usageCount: 0, lastUsedAt: null, createdAt: new Date() },
    { id: 'tag-4', name: 'reflection', color: TAG_COLORS[8].value, usageCount: 0, lastUsedAt: null, createdAt: new Date() },
    { id: 'tag-5', name: 'gratitude', color: TAG_COLORS[3].value, usageCount: 0, lastUsedAt: null, createdAt: new Date() },
  ],
  recentMoods: [],
  defaultPlaceholder: 'Start writing...',
  defaultModeMarkdown: true,
  diaryModeEnabled: false,
  amountOfNotes: 0,
  activity: [],
};

export type TemplatePreview = {
  id: TemplateStyle;
  name: string;
  description: string;
  preview: string;
};

export const TEMPLATE_OPTIONS: TemplatePreview[] = [
  {
    id: 'simple',
    name: 'Simple Title',
    description: 'Uses the document title as the first line. Minimal layout.',
    preview: `# My Note Title

Start writing here...`,
  },
  {
    id: 'notion',
    name: 'Notion Style',
    description: 'Title with inline metadata including timestamps.',
    preview: `# My Note Title
created: 2026-03-06
updated: 2026-03-06

Start writing here...`,
  },
  {
    id: 'journal',
    name: 'Journal',
    description: 'Daily journaling with mood tracking and reusable tags.',
    preview: `# Thursday, March 6, 2026

mood: neutral
tags: #reflection #gratitude

---

*9:30 AM*

Your entry here...`,
  },
];
