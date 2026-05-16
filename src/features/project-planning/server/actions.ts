"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/core/supabase/server-client";
import type {
  CustomSection,
  CustomSectionItem,
  Feature,
  FeatureStatus,
  Issue,
  NiceToHave,
  Priority,
  ScratchEntry,
  ScratchType,
  IssueStatus,
} from "../types";
import {
  mapCustomItem,
  mapCustomSection,
  mapFeature,
  mapIssue,
  mapNiceToHave,
  mapScratch,
} from "./mappers";
import type {
  FeatureRow,
  IssueRow,
  NiceToHaveRow,
  PlanningSectionItemRow,
  PlanningSectionRow,
  ScratchEntryRow,
} from "./rows";

const ROUTE = "/project-planning";

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (error) throw error;
  if (data !== true) {
    throw new Error("Forbidden: admin role required");
  }
  return { supabase, user };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || `topic-${Date.now()}`;
}

async function uniqueSlug(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  base: string,
): Promise<string> {
  let slug = slugify(base);
  let suffix = 1;
  while (true) {
    const { data, error } = await supabase
      .from("features")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) return slug;
    suffix += 1;
    slug = `${slugify(base)}-${suffix}`;
  }
}

// Feature actions ----------------------------------------------------------

export type FeatureDraft = {
  title: string;
  description?: string;
  status?: FeatureStatus;
  priority?: Priority;
  tags?: string[];
};

export async function createFeature(draft: FeatureDraft): Promise<Feature> {
  const { supabase, user } = await requireAdmin();
  const slug = await uniqueSlug(supabase, draft.title || "new-topic");
  const { data, error } = await supabase
    .from("features")
    .insert({
      title: draft.title.trim() || "New topic",
      slug,
      description: draft.description ?? "",
      status: draft.status ?? "exploring",
      priority: draft.priority ?? "medium",
      tags: draft.tags ?? [],
      created_by: user.id,
    })
    .select("id, title, slug, description, status, priority, tags, created_at, updated_at")
    .single();
  if (error) throw error;
  revalidatePath(ROUTE);
  return mapFeature(data as FeatureRow, []);
}

export type FeaturePatch = Partial<{
  title: string;
  description: string;
  status: FeatureStatus;
  priority: Priority;
  tags: string[];
}>;

export async function updateFeature(id: string, patch: FeaturePatch): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("features").update(patch).eq("id", id);
  if (error) throw error;
  revalidatePath(ROUTE);
}

export async function updateFeatureStatus(id: string, status: FeatureStatus): Promise<void> {
  return updateFeature(id, { status });
}

export async function deleteFeature(id: string): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("features").delete().eq("id", id);
  if (error) throw error;
  revalidatePath(ROUTE);
}

// Issue actions ------------------------------------------------------------

export type IssueDraftInput = {
  title: string;
  description?: string;
  status?: IssueStatus;
  priority?: Priority;
  assignee?: string;
  tags?: string[];
  notes?: string;
};

export async function createIssue(
  featureId: string,
  draft: IssueDraftInput,
): Promise<Issue> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("issues")
    .insert({
      feature_id: featureId,
      title: draft.title.trim(),
      description: draft.description ?? "",
      status: draft.status ?? "todo",
      priority: draft.priority ?? "medium",
      assignee: draft.assignee?.trim() || null,
      tags: draft.tags ?? [],
      notes: draft.notes?.trim() || null,
    })
    .select(
      "id, feature_id, title, description, status, priority, assignee, tags, notes, created_at, updated_at",
    )
    .single();
  if (error) throw error;
  revalidatePath(ROUTE);
  return mapIssue(data as IssueRow);
}

export type IssuePatch = Partial<{
  title: string;
  description: string;
  status: IssueStatus;
  priority: Priority;
  assignee: string | null;
  tags: string[];
  notes: string | null;
}>;

export async function updateIssue(id: string, patch: IssuePatch): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("issues").update(patch).eq("id", id);
  if (error) throw error;
  revalidatePath(ROUTE);
}

export async function deleteIssue(id: string): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("issues").delete().eq("id", id);
  if (error) throw error;
  revalidatePath(ROUTE);
}

// Nice-to-have actions -----------------------------------------------------

export type NiceDraftInput = {
  title: string;
  description?: string;
  reason?: string;
  priority?: Priority;
};

export async function createNiceToHave(draft: NiceDraftInput): Promise<NiceToHave> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("nice_to_haves")
    .insert({
      title: draft.title.trim(),
      description: draft.description ?? "",
      reason: draft.reason ?? "",
      priority: draft.priority ?? "medium",
    })
    .select("id, title, description, reason, priority, created_at")
    .single();
  if (error) throw error;
  revalidatePath(ROUTE);
  return mapNiceToHave(data as NiceToHaveRow);
}

export type NicePatch = Partial<{
  title: string;
  description: string;
  reason: string;
  priority: Priority;
}>;

export async function updateNiceToHave(id: string, patch: NicePatch): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("nice_to_haves").update(patch).eq("id", id);
  if (error) throw error;
  revalidatePath(ROUTE);
}

export async function deleteNiceToHave(id: string): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("nice_to_haves").delete().eq("id", id);
  if (error) throw error;
  revalidatePath(ROUTE);
}

// Scratch actions ----------------------------------------------------------

export type ScratchDraftInput = {
  title: string;
  content?: string;
  type?: ScratchType;
};

export async function createScratch(draft: ScratchDraftInput): Promise<ScratchEntry> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("scratch_entries")
    .insert({
      title: draft.title.trim(),
      content: draft.content ?? "",
      type: draft.type ?? "note",
    })
    .select("id, title, content, type, created_at")
    .single();
  if (error) throw error;
  revalidatePath(ROUTE);
  return mapScratch(data as ScratchEntryRow);
}

export type ScratchPatch = Partial<{
  title: string;
  content: string;
  type: ScratchType;
}>;

export async function updateScratch(id: string, patch: ScratchPatch): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("scratch_entries").update(patch).eq("id", id);
  if (error) throw error;
  revalidatePath(ROUTE);
}

export async function deleteScratch(id: string): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("scratch_entries").delete().eq("id", id);
  if (error) throw error;
  revalidatePath(ROUTE);
}

// Cross-section moves ------------------------------------------------------
// Backed by SECURITY DEFINER RPCs that wrap the insert+delete in one
// transaction. Admin role is enforced inside the function and at this layer.

export async function moveFeature(id: string, to: "nice" | "scratch"): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("move_feature_to_section", {
    _feature_id: id,
    _target: to,
  });
  if (error) throw error;
  revalidatePath(ROUTE);
}

export async function moveNiceToHave(id: string, to: "roadmap" | "scratch"): Promise<void> {
  const { supabase } = await requireAdmin();
  let newSlug = "";
  if (to === "roadmap") {
    const { data: nice, error: readError } = await supabase
      .from("nice_to_haves")
      .select("title")
      .eq("id", id)
      .single();
    if (readError) throw readError;
    if (!nice) throw new Error("Nice-to-have not found");
    newSlug = await uniqueSlug(supabase, nice.title);
  }
  const { error } = await supabase.rpc("move_nice_to_section", {
    _nice_id: id,
    _target: to,
    _new_slug: newSlug,
  });
  if (error) throw error;
  revalidatePath(ROUTE);
}

export async function moveScratch(id: string, to: "roadmap" | "nice"): Promise<void> {
  const { supabase } = await requireAdmin();
  let newSlug = "";
  if (to === "roadmap") {
    const { data: entry, error: readError } = await supabase
      .from("scratch_entries")
      .select("title")
      .eq("id", id)
      .single();
    if (readError) throw readError;
    if (!entry) throw new Error("Scratch entry not found");
    newSlug = await uniqueSlug(supabase, entry.title);
  }
  const { error } = await supabase.rpc("move_scratch_to_section", {
    _scratch_id: id,
    _target: to,
    _new_slug: newSlug,
  });
  if (error) throw error;
  revalidatePath(ROUTE);
}

// Custom section actions ---------------------------------------------------

async function uniqueSectionSlug(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  base: string,
): Promise<string> {
  let slug = slugify(base);
  let suffix = 1;
  while (true) {
    const { data, error } = await supabase
      .from("planning_sections")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) return slug;
    suffix += 1;
    slug = `${slugify(base)}-${suffix}`;
  }
}

export type SectionDraft = {
  title: string;
  description?: string;
};

export async function createCustomSection(draft: SectionDraft): Promise<CustomSection> {
  const { supabase } = await requireAdmin();
  const slug = await uniqueSectionSlug(supabase, draft.title || "section");
  const { data: maxRes } = await supabase
    .from("planning_sections")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRes?.sort_order ?? -1) + 1;
  const { data, error } = await supabase
    .from("planning_sections")
    .insert({
      slug,
      title: draft.title.trim() || "Untitled section",
      description: draft.description ?? "",
      sort_order: nextOrder,
    })
    .select("id, slug, title, description, sort_order, created_at, updated_at")
    .single();
  if (error) throw error;
  revalidatePath(ROUTE);
  return mapCustomSection(data as PlanningSectionRow, []);
}

export type SectionPatch = Partial<{
  title: string;
  description: string;
  sort_order: number;
}>;

export async function updateCustomSection(id: string, patch: SectionPatch): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("planning_sections").update(patch).eq("id", id);
  if (error) throw error;
  revalidatePath(ROUTE);
}

export async function deleteCustomSection(id: string): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("planning_sections").delete().eq("id", id);
  if (error) throw error;
  revalidatePath(ROUTE);
}

export type SectionItemDraft = {
  title: string;
  content?: string;
  priority?: Priority | null;
  tags?: string[];
};

export async function createCustomItem(
  sectionId: string,
  draft: SectionItemDraft,
): Promise<CustomSectionItem> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("planning_section_items")
    .insert({
      section_id: sectionId,
      title: draft.title.trim() || "Untitled",
      content: draft.content ?? "",
      priority: draft.priority ?? null,
      tags: draft.tags ?? [],
    })
    .select(
      "id, section_id, title, content, priority, tags, sort_order, created_at, updated_at",
    )
    .single();
  if (error) throw error;
  revalidatePath(ROUTE);
  return mapCustomItem(data as PlanningSectionItemRow);
}

export type SectionItemPatch = Partial<{
  title: string;
  content: string;
  priority: Priority | null;
  tags: string[];
}>;

export async function updateCustomItem(id: string, patch: SectionItemPatch): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("planning_section_items").update(patch).eq("id", id);
  if (error) throw error;
  revalidatePath(ROUTE);
}

export async function deleteCustomItem(id: string): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("planning_section_items").delete().eq("id", id);
  if (error) throw error;
  revalidatePath(ROUTE);
}
