import type {
  AIConfigCreateInput,
  AIConfigPatchInput,
  AIConfigResponse,
  AIPromptRequest,
  AIPromptResponse,
  AIUsageResponse,
  CreateNoteInput,
  FolderResponse,
  ImportItem,
  ImportPayload,
  KeyCombo,
  NoteOrFolderResponse,
  NoteResponse,
  SettingsRecord,
  SettingsUpsertInput,
  ShortcutResponse,
  ShortcutUpsertInput,
  Task,
  TaskCreateInput,
  TaskSyncItem,
  TaskSyncPayload,
  TaskUpdateInput,
  UpdateNoteInput
} from '../schemas'

export type Id = string
export type Timestamp = number

export type NoteType = 'note' | 'folder'

export type {
  CreateNoteInput,
  UpdateNoteInput,
  NoteResponse,
  FolderResponse,
  NoteOrFolderResponse,
  SettingsUpsertInput,
  SettingsRecord,
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  TaskSyncItem,
  TaskSyncPayload,
  KeyCombo,
  ShortcutUpsertInput,
  ShortcutResponse,
  AIConfigCreateInput,
  AIConfigPatchInput,
  AIConfigResponse,
  AIPromptRequest,
  AIPromptResponse,
  AIUsageResponse,
  ImportItem,
  ImportPayload
}
