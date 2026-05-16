import type { FeatureStatus, IssueStatus, Priority, ScratchType } from "../types";

export type FeatureRow = {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: FeatureStatus;
  priority: Priority;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

export type IssueRow = {
  id: string;
  feature_id: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: Priority;
  assignee: string | null;
  tags: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type NiceToHaveRow = {
  id: string;
  title: string;
  description: string;
  reason: string;
  priority: Priority;
  created_at: string;
};

export type ScratchEntryRow = {
  id: string;
  title: string;
  content: string;
  type: ScratchType;
  created_at: string;
};

export type PlanningSectionRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PlanningSectionItemRow = {
  id: string;
  section_id: string;
  title: string;
  content: string;
  priority: Priority | null;
  tags: string[] | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
