// @vitest-environment jsdom
import { LocalStorageAdapter } from "../../lib/storage/adapters/local-storage-adapter";
import { describe, it, expect, beforeEach, vi } from "vitest";

describe('Guest Storage Persistence', () => {
	let adapter: LocalStorageAdapter
	const TEST_KEY = 'skriuw:test-notes'

	beforeEach(() => {
		localStorage.clear()
		adapter = new LocalStorageAdapter()
	})

	it('should persist data to localStorage', async () => {
		const testNote = {
			id: 'note-1',
			content: 'Test content',
			title: 'Test Note'
		}

		await adapter.create(TEST_KEY, testNote)

		const raw = localStorage.getItem(TEST_KEY)
		expect(raw).toBeTruthy()
		expect(JSON.parse(raw!)).toHaveLength(1)
		expect(JSON.parse(raw!)[0].id).toBe('note-1')
	})

	it('should retrieve persisted data after re-instantiation', async () => {
		const testNote = {
			id: 'note-persistence',
			content: 'Persistence check',
			title: 'Persisted Note'
		}

		await adapter.create(TEST_KEY, testNote)

		const newAdapter = new LocalStorageAdapter()

		const items = (await newAdapter.read<any>(TEST_KEY)) as any[]

		expect(items).toBeDefined()
		expect(items).toHaveLength(1)
		expect(items[0].id).toBe('note-persistence')
		expect(items[0].content).toBe('Persistence check')
	})

	it('should handle complex nested structures (folders/tasks)', async () => {
		const rootFolder = {
			id: 'folder-root',
			type: 'folder',
			name: 'Root Folder'
		}

		const childNote = {
			id: 'note-child',
			parentFolderId: 'folder-root',
			content: 'Child content'
		}

		await adapter.create(TEST_KEY, rootFolder)
		await adapter.create(TEST_KEY, childNote)

		const newAdapter = new LocalStorageAdapter()
		const items = (await newAdapter.read<any>(TEST_KEY)) as any[]

		const folder = items.find((i) => i.id === 'folder-root')
		expect(folder).toBeDefined()
		expect(folder.children).toBeDefined()
		expect(folder.children).toHaveLength(1)
		expect(folder.children[0].id).toBe('note-child')
	})
})

