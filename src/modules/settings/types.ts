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

export type UserSettings = {
  userId: string;
  templateStyle: TemplateStyle;
  templateTimestamps: Record<TemplateStyle, TemplateTimestamp>;
  defaultPlaceholder: string;
  defaultModeMarkdown: boolean;
  diaryModeEnabled: boolean;
  amountOfNotes: number;
  activity: ActivityItem[];
};

export const DEFAULT_SETTINGS: Omit<UserSettings, 'userId'> = {
  templateStyle: 'simple',
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
    description: 'Optimized for daily journaling with mood and tags.',
    preview: `# March 6, 2026

mood: 
tags: 

---

Entry text...`,
  },
];
