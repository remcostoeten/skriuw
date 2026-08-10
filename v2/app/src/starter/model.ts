import type { WorkspaceSettings } from "../contracts/workspace";

export const STARTER_SEED_VERSION = 1;

export function hasSeededStarter(settings: WorkspaceSettings): boolean {
  const version = settings["starterSeedVersion"];
  return typeof version === "number" && Number.isInteger(version) && version >= 1;
}

export function seededNoteIds(settings: WorkspaceSettings): string[] {
  const raw = settings["starterSeedNoteIds"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string");
}

export function isUnseededFreshWorkspace(
  settings: WorkspaceSettings,
  workspaceNodeCount: number,
): boolean {
  return workspaceNodeCount === 0 && !hasSeededStarter(settings);
}

/**
 * A signed-in visitor already has a workspace on the server, so seeding a
 * second device would push duplicate preview notes into their account.
 */
export function shouldSeedStarter(
  settings: WorkspaceSettings,
  workspaceNodeCount: number,
  authenticated: boolean,
): boolean {
  return !authenticated && isUnseededFreshWorkspace(settings, workspaceNodeCount);
}

export function completeSeed(
  settings: WorkspaceSettings,
  noteIds: readonly string[],
  at: number,
): WorkspaceSettings {
  return {
    ...settings,
    starterSeedVersion: STARTER_SEED_VERSION,
    starterSeedNoteIds: [...noteIds],
    starterSeedAt: at,
  };
}

/**
 * Records that the preview is spent without listing notes to reclaim, so a
 * workspace that skipped seeding never seeds later.
 */
export function markSeedSpent(settings: WorkspaceSettings): WorkspaceSettings {
  if (hasSeededStarter(settings)) return settings;
  return { ...settings, starterSeedVersion: STARTER_SEED_VERSION, starterSeedNoteIds: [] };
}

export function forgetSeededNotes(settings: WorkspaceSettings): WorkspaceSettings {
  if (seededNoteIds(settings).length === 0) return settings;
  return { ...settings, starterSeedNoteIds: [] };
}

export function seededAt(settings: WorkspaceSettings): number | null {
  const raw = settings["starterSeedAt"];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export type SeededNoteState = {
  id: string;
  updatedAt: number;
};

/**
 * Preview notes stop being reclaimable the moment the visitor edits one — an
 * edited note is theirs, per the same rule that makes deletion permanent.
 * Editing bumps `updatedAt`, so the seed timestamp is the whole test and no
 * document body has to be loaded to apply it.
 */
export function reclaimableNoteIds(
  settings: WorkspaceSettings,
  present: readonly SeededNoteState[],
): string[] {
  const plantedAt = seededAt(settings);
  if (plantedAt === null) return [];
  const seeded = new Set(seededNoteIds(settings));
  return present
    .filter((note) => seeded.has(note.id) && note.updatedAt <= plantedAt)
    .map((note) => note.id);
}
