export const MAX_NOTE_NAME_LENGTH = 255
export const MAX_NOTE_CONTENT_BYTES = 5 * 1024 * 1024

export const MAX_TASK_CONTENT_LENGTH = 5000
export const MAX_TASK_DESCRIPTION_LENGTH = 10000

export const MAX_SHORTCUT_KEYS_PER_COMBO = 8
export const MAX_SHORTCUT_COMBOS = 20

export const AI_DEFAULT_TEMPERATURE = 70
export const AI_MIN_TEMPERATURE = 0
export const AI_MAX_TEMPERATURE = 100
export const AI_DAILY_PROMPT_LIMIT = 3

export const IMPORT_MAX_PAYLOAD_BYTES = 5 * 1024 * 1024
export const IMPORT_MAX_ITEMS = 10000

export const RATE_LIMITS = {
  aiPromptsPerDay: AI_DAILY_PROMPT_LIMIT,
  importPayloadBytes: IMPORT_MAX_PAYLOAD_BYTES
} as const
