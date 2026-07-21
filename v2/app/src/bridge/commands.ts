import { invoke } from "@tauri-apps/api/core";
import type {
  OperationAck,
  SearchHit,
  WorkspaceOperationEnvelope,
  WorkspaceSnapshot,
} from "../contracts/workspace";

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
