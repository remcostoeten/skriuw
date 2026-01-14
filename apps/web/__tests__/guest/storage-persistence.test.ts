// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LocalStorageAdapter } from '../../lib/storage/adapters/local-storage-adapter'

describe('Guest Storage Persistence', () => {
    let adapter: LocalStorageAdapter
    const TEST_KEY = 'skriuw:test-notes'

    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear()
        adapter = new LocalStorageAdapter()
    })

    it('should persist data to localStorage', async () => {
        const testNote = {
            id: 'note-1',
            content: 'Test content',
            title: 'Test Note'
        }

        // 1. Write data
        await adapter.create(TEST_KEY, testNote)

        // 2. Verify it's in localStorage raw
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

        // 1. Write data with first adapter instance
        await adapter.create(TEST_KEY, testNote)

        // 2. Create NEW adapter instance (simulating page reload/app restart)
        const newAdapter = new LocalStorageAdapter()

        // 3. Read back
        const items = await newAdapter.read<any>(TEST_KEY) as any[]
        
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

        // 1. Create structure
        await adapter.create(TEST_KEY, rootFolder)
        await adapter.create(TEST_KEY, childNote)

        // 2. Reload adapter
        const newAdapter = new LocalStorageAdapter()
        const items = await newAdapter.read<any>(TEST_KEY) as any[]

        // 3. Verify hierarchy reconstruction
        const folder = items.find(i => i.id === 'folder-root')
        expect(folder).toBeDefined()
        expect(folder.children).toBeDefined()
        expect(folder.children).toHaveLength(1)
        expect(folder.children[0].id).toBe('note-child')
    })
})
