import { describe, expect, it } from 'bun:test'

import {
	AIConfigCreateSchema,
	AIConfigPatchSchema,
	CreateNoteSchema,
	ImportPayloadSchema,
	SettingsUpsertSchema,
	ShortcutUpsertSchema,
	TaskCreateSchema,
	TaskSyncPayloadSchema,
	UpdateNoteSchema
} from '../index'
import { IMPORT_MAX_ITEMS, MAX_SHORTCUT_COMBOS, MAX_SHORTCUT_KEYS_PER_COMBO } from '../../rules'

describe('core schemas', () => {
	it('validates notes schemas (valid + invalid)', () => {
		const created = CreateNoteSchema.parse({ name: 'My note' })
		expect(created.type).toBe('note')

		expect(CreateNoteSchema.safeParse({ name: '' }).success).toBeFalse()
		expect(UpdateNoteSchema.safeParse({ name: 'No id' }).success).toBeFalse()
		expect(UpdateNoteSchema.safeParse({ id: 'n1', pinnedAt: -1 }).success).toBeFalse()
	})

	it('validates settings schema (valid + invalid)', () => {
		const parsed = SettingsUpsertSchema.parse({})
		expect(parsed.settings).toEqual({})

		const invalid = SettingsUpsertSchema.safeParse({ settings: 'bad' })
		expect(invalid.success).toBeFalse()
	})

	it('validates task schemas (valid + invalid)', () => {
		const create = TaskCreateSchema.safeParse({
			noteId: 'note-1',
			blockId: 'block-1',
			content: 'Do this',
			checked: true
		})
		expect(create.success).toBeTrue()

		expect(
			TaskCreateSchema.safeParse({
				noteId: 'note-1',
				blockId: 'block-1',
				content: '   '
			}).success
		).toBeFalse()

		const sync = TaskSyncPayloadSchema.parse({ noteId: 'note-1' })
		expect(sync.tasks).toEqual([])

		expect(
			TaskSyncPayloadSchema.safeParse({
				noteId: 'note-1',
				tasks: [{ blockId: 'b1', content: 'x', checked: 'yes', parentTaskId: null }]
			}).success
		).toBeFalse()
	})

	it('validates ai config schemas (valid + invalid)', () => {
		const created = AIConfigCreateSchema.parse({ provider: 'gemini', model: 'flash' })
		expect(created.temperature).toBe(70)

		expect(
			AIConfigCreateSchema.safeParse({ provider: 'openai', model: 'gpt' }).success
		).toBeFalse()
		expect(AIConfigPatchSchema.safeParse({}).success).toBeFalse()
	})

	it('validates import schema (valid + invalid)', () => {
		const ok = ImportPayloadSchema.safeParse({
			items: [
				{
					id: 'folder-1',
					name: 'Root',
					type: 'folder',
					children: [{ id: 'note-1', name: 'Nested', type: 'note', content: { a: 1 } }]
				}
			]
		})
		expect(ok.success).toBeTrue()

		expect(ImportPayloadSchema.safeParse({}).success).toBeFalse()

		const tooMany = Array.from({ length: IMPORT_MAX_ITEMS + 1 }, (_, i) => ({
			id: `n-${i}`,
			name: `Note ${i}`,
			type: 'note' as const
		}))
		expect(ImportPayloadSchema.safeParse({ items: tooMany }).success).toBeFalse()
	})

	it('validates shortcuts schema (valid + invalid)', () => {
		const keys = Array.from({ length: MAX_SHORTCUT_KEYS_PER_COMBO }, (_, i) => `K${i + 1}`)
		const valid = ShortcutUpsertSchema.safeParse({
			id: 'open-command',
			keys: [keys]
		})
		expect(valid.success).toBeTrue()

		const tooManyCombos = Array.from({ length: MAX_SHORTCUT_COMBOS + 1 }, () => ['Ctrl', 'K'])
		expect(ShortcutUpsertSchema.safeParse({ id: 'x', keys: tooManyCombos }).success).toBeFalse()

		expect(
			ShortcutUpsertSchema.safeParse({
				id: 'x',
				keys: [Array.from({ length: MAX_SHORTCUT_KEYS_PER_COMBO + 1 }, () => 'X')]
			}).success
		).toBeFalse()
	})
})
