import "server-only";

import { createServerSupabaseClient } from "@/core/supabase/server-client";
import type { CustomSection, Feature, NiceToHave, ScratchEntry } from "../types";
import {
  mapCustomSection,
  mapFeature,
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

export type PlanningSnapshot = {
  features: Feature[];
  niceToHaves: NiceToHave[];
  scratch: ScratchEntry[];
  customSections: CustomSection[];
  isAdmin: boolean;
  isSignedIn: boolean;
};

export async function fetchPlanningSnapshot(): Promise<PlanningSnapshot> {
  const supabase = await createServerSupabaseClient();

  const [
    featuresRes,
    issuesRes,
    niceRes,
    scratchRes,
    sectionsRes,
    sectionItemsRes,
    userRes,
  ] = await Promise.all([
    supabase
      .from("features")
      .select("id, title, slug, description, status, priority, tags, created_at, updated_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("issues")
      .select(
        "id, feature_id, title, description, status, priority, assignee, tags, notes, created_at, updated_at",
      )
      .order("created_at", { ascending: true }),
    supabase
      .from("nice_to_haves")
      .select("id, title, description, reason, priority, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("scratch_entries")
      .select("id, title, content, type, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("planning_sections")
      .select("id, slug, title, description, sort_order, created_at, updated_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("planning_section_items")
      .select(
        "id, section_id, title, content, priority, tags, sort_order, created_at, updated_at",
      ),
    supabase.auth.getUser(),
  ]);

  if (featuresRes.error) throw featuresRes.error;
  if (issuesRes.error) throw issuesRes.error;
  if (niceRes.error) throw niceRes.error;
  if (scratchRes.error) throw scratchRes.error;
  if (sectionsRes.error) throw sectionsRes.error;
  if (sectionItemsRes.error) throw sectionItemsRes.error;
  if (userRes.error) throw userRes.error;

  const user = userRes.data.user;
  let isAdmin = false;
  if (user) {
    const { data, error } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (error) throw error;
    isAdmin = data === true;
  }

  const featureRows = (featuresRes.data ?? []) as FeatureRow[];
  const issueRows = (issuesRes.data ?? []) as IssueRow[];
  const niceRows = (niceRes.data ?? []) as NiceToHaveRow[];
  const scratchRows = (scratchRes.data ?? []) as ScratchEntryRow[];
  const sectionRows = (sectionsRes.data ?? []) as PlanningSectionRow[];
  const sectionItemRows = (sectionItemsRes.data ?? []) as PlanningSectionItemRow[];

  return {
    features: featureRows.map((f) => mapFeature(f, issueRows)),
    niceToHaves: niceRows.map(mapNiceToHave),
    scratch: scratchRows.map(mapScratch),
    customSections: sectionRows.map((s) => mapCustomSection(s, sectionItemRows)),
    isAdmin,
    isSignedIn: Boolean(user),
  };
}
