'use client'

import { useWithIdentity, createCrudGuard, withIdentity, isIdentityError } from '@/lib/identity-guard'
import { useState } from 'react'

// Example server actions (these would be in your actions folder)
const exampleServerActions = {
  createNote: async (data: { name: string; content: string }) => {
    // This would be your actual server action
    console.log('Creating note:', data)
    await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate server delay
    return { id: '123', ...data }
  },

  updateNote: async (id: string, data: Partial<{ name: string; content: string }>) => {
    console.log('Updating note:', id, data)
    await new Promise(resolve => setTimeout(resolve, 500))
    return { id, ...data }
  },

  deleteNote: async (id: string) => {
    console.log('Deleting note:', id)
    await new Promise(resolve => setTimeout(resolve, 300))
    return { success: true }
  }
}

/**
 * Example component showing different ways to use the identity guard
 */
export function IdentityGuardExample() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string>('')
  const withIdentity = useWithIdentity()

  // Option 1: Wrap individual actions with custom options
  const safeCreateNote = withIdentity(exampleServerActions.createNote, {
    action: 'create-note',
    errorMessage: 'Please sign in to create notes'
  })

  const safeUpdateNote = withIdentity(exampleServerActions.updateNote, {
    action: 'update-note'
  })

  // Option 2: Wrap all CRUD operations at once with default options
  const notesApi = createCrudGuard(exampleServerActions, {
    showModal: true,
    errorMessage: 'Authentication required for this action'
  })

  // Option 3: Direct wrapping without hook (less efficient, makes network call)
  const safeDeleteNote = withIdentity(exampleServerActions.deleteNote, {
    action: 'delete-note'
  })

  const handleCreate = async () => {
    setLoading(true)
    setResult('')

    try {
      const note = await safeCreateNote({
        name: 'My New Note',
        content: 'This is a test note created with identity guard'
      })
      setResult(`✅ Note created: ${note.name}`)
    } catch (error) {
      if (isIdentityError(error)) {
        setResult('🔐 Please sign in to create notes')
      } else {
        setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async () => {
    setLoading(true)
    setResult('')

    try {
      const note = await safeUpdateNote('123', { name: 'Updated Note Name' })
      setResult(`✅ Note updated: ${note.name}`)
    } catch (error) {
      if (isIdentityError(error)) {
        setResult('🔐 Please sign in to update notes')
      } else {
        setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    setResult('')

    try {
      await safeDeleteNote('123')
      setResult('✅ Note deleted successfully')
    } catch (error) {
      if (isIdentityError(error)) {
        setResult('🔐 Please sign in to delete notes')
      } else {
        setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCrudApi = async () => {
    setLoading(true)
    setResult('')

    try {
      const note = await notesApi.create({
        name: 'Note via CRUD API',
        content: 'Created using the createCrudGuard wrapper'
      })
      setResult(`✅ CRUD API Note created: ${note.name}`)
    } catch (error) {
      if (isIdentityError(error)) {
        setResult('🔐 Please sign in to use the notes API')
      } else {
        setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold mb-4">Identity Guard Examples</h2>

      <div className="bg-muted p-4 rounded-lg">
        <h3 className="font-semibold mb-2">How it works:</h3>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>• If you have a session (authenticated or anonymous), operations proceed normally</li>
          <li>• If you have no session, the auth modal automatically opens</li>
          <li>• Actions are blocked until you authenticate</li>
          <li>• TypeScript preserves all function signatures and types</li>
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleCreate}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Create Note'}
        </button>

        <button
          onClick={handleUpdate}
          disabled={loading}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Update Note'}
        </button>

        <button
          onClick={handleDelete}
          disabled={loading}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Delete Note'}
        </button>

        <button
          onClick={handleCrudApi}
          disabled={loading}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Use CRUD API'}
        </button>
      </div>

      {result && (
        <div className={`p-3 rounded ${result.startsWith('✅') ? 'bg-green-100 text-green-800' : result.startsWith('🔐') ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
          {result}
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>Try this:</strong> If you're not signed in, click any button to see the auth modal open automatically.</p>
        <p><strong>Developer notes:</strong> Check the browser console for operation logs.</p>
      </div>
    </div>
  )
}

/**
 * Example of how to wrap server actions for use in your app
 */
export function wrapServerActions<T extends Record<string, (...args: any[]) => Promise<any>>>(
  actions: T
) {
  return createCrudGuard(actions, {
    showModal: true,
    errorMessage: 'Please sign in to continue'
  })
}

// Usage example in your actual app:
/*
// In your actions file:
import { withServerIdentity } from '@/lib/server-identity-guard'

export async function createNote(data: { name: string; content: string }) {
  return withServerIdentity(async () => {
    // Your existing createNote logic here
    // This will only execute if user has a session (authenticated or anonymous)
    const result = await db.insert(notes).values({
      id: generateId(),
      ...data,
      userId: session.user.id
    })
    return result
  })
}

// In your component:
import { wrapServerActions } from '@/examples/identity-guard-usage'
import * as noteActions from '@/app/actions/notes'

const notesApi = wrapServerActions(noteActions)

// Now use notesApi.create(), notesApi.update(), etc.
// They will automatically trigger auth modal if needed
*/