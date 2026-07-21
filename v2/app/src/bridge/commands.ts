import { invoke } from "@tauri-apps/api/core";
import type {
  OperationAck,
  SearchHit,
  WorkspaceOperationEnvelope,
  WorkspaceSnapshot,
} from "../contracts/workspace";

export type HistoryVersionContent = {
  noteId: string;
  versionId: string;
  createdAt: number;
  summary: string;
  revision: number;
  markdown: string;
};

export function bootstrapWorkspace(): Promise<WorkspaceSnapshot> {
  return invoke<WorkspaceSnapshot>("bootstrap_workspace");
}

export function applyWorkspaceOperations(
  operations: WorkspaceOperationEnvelope[],
): Promise<OperationAck> {
  return invoke<OperationAck>("apply_workspace_operations", { operations });
}

export function searchWorkspace(query: string, limit: number): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("search_workspace", { query, limit });
}

export function readHistoryVersion(
  noteId: string,
  versionId: string,
): Promise<HistoryVersionContent> {
  return invoke<HistoryVersionContent>("read_history_version", { noteId, versionId });
}

export function workspaceStoragePath(): Promise<string> {
  return invoke<string>("workspace_storage_path");
}

export function revealWorkspaceStorage(): Promise<void> {
  return invoke<void>("reveal_workspace_storage");
}
