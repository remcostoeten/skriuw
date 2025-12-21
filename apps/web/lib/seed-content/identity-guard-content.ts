import type { Block } from '@blocknote/core'
import { generateId } from '@skriuw/shared'

/**
 * BlockNote content for Identity Guard knowledge documentation
 * This content explains the unified identity guard pattern implemented in the app
 */
export const identityGuardNoteContent: Block[] = [
  {
    id: generateId(),
    type: 'heading',
    props: {
      level: 1,
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: 'Identity Guard Pattern',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'paragraph',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: 'The ',
        styles: {},
      },
      {
        type: 'text',
        text: 'Identity Guard',
        styles: { bold: true },
      },
      {
        type: 'text',
        text: ' is a unified authentication pattern that automatically handles user authentication for CRUD operations. It ensures users have proper identity before performing actions while supporting both authenticated and anonymous users.',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'heading',
    props: {
      level: 2,
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: '🎯 Core Concepts',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'paragraph',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: 'The Identity Guard pattern distinguishes between three user states:',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'bulletListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: '✅ ',
        styles: {},
      },
      {
        type: 'text',
        text: 'Authenticated User',
        styles: { bold: true },
      },
      {
        type: 'text',
        text: ' - Fully logged in with email/password or OAuth',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'bulletListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: '👤 ',
        styles: {},
      },
      {
        type: 'text',
        text: 'Anonymous User',
        styles: { bold: true },
      },
      {
        type: 'text',
        text: ' - Temporary session with limited functionality',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'bulletListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: '❌ ',
        styles: {},
      },
      {
        type: 'text',
        text: 'No Identity',
        styles: { bold: true },
      },
      {
        type: 'text',
        text: ' - No session exists, triggers authentication',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'heading',
    props: {
      level: 2,
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: '🛠️ Implementation Methods',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'heading',
    props: {
      level: 3,
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: '1. React Hook (Recommended)',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'codeBlock',
    props: {
      language: 'typescript',
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: "import { useWithIdentity } from '@/lib/identity-guard'\n\nfunction MyComponent() {\n  const withIdentity = useWithIdentity()\n  \n  const safeCreateNote = withIdentity(createNote, {\n    action: 'create-note',\n    errorMessage: 'Please sign in to create notes'\n  })\n  \n  // Call safeCreateNote() - will show auth modal if needed\n}",
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'heading',
    props: {
      level: 3,
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: '2. Direct Wrapper',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'codeBlock',
    props: {
      language: 'typescript',
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: "import { withIdentity } from '@/lib/identity-guard'\n\nconst safeUpdateNote = withIdentity(updateNote, {\n  action: 'update-note',\n  showModal: true\n})\n\n// Use safeUpdateNote() directly",
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'heading',
    props: {
      level: 3,
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: '3. Bulk CRUD Wrapper',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'codeBlock',
    props: {
      language: 'typescript',
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: "import { createCrudGuard } from '@/lib/identity-guard'\n\nconst notesApi = createCrudGuard({\n  create: createNote,\n  update: updateNote,\n  delete: deleteNote\n}, { showModal: true })\n\n// Use notesApi.create(), notesApi.update(), etc.",
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'heading',
    props: {
      level: 3,
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: '4. Server Action Wrapper',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'codeBlock',
    props: {
      language: 'typescript',
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: "import { withServerIdentity } from '@/lib/server-identity-guard'\n\nexport async function createNote(data: NoteData) {\n  return withServerIdentity(async () => {\n    // Your existing logic here\n    // Only runs if user has identity (auth or anon)\n    return await db.insert(notes).values(data)\n  })\n}",
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'heading',
    props: {
      level: 2,
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: '⚡ Key Features',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'bulletListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: '🔐 ',
        styles: {},
      },
      {
        type: 'text',
        text: 'Automatic Auth Modal',
        styles: { bold: true },
      },
      {
        type: 'text',
        text: ' - Opens seamlessly when no session exists',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'bulletListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: '👥 ',
        styles: {},
      },
      {
        type: 'text',
        text: 'Anonymous Support',
        styles: { bold: true },
      },
      {
        type: 'text',
        text: ' - Works with both authenticated and anonymous users',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'bulletListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: '🔒 ',
        styles: {},
      },
      {
        type: 'text',
        text: 'Type Safety',
        styles: { bold: true },
      },
      {
        type: 'text',
        text: ' - Preserves all function signatures and types',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'bulletListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: '🎨 ',
        styles: {},
      },
      {
        type: 'text',
        text: 'Flexible Usage',
        styles: { bold: true },
      },
      {
        type: 'text',
        text: ' - Multiple patterns for different use cases',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'bulletListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: '🔗 ',
        styles: {},
      },
      {
        type: 'text',
        text: 'Event System',
        styles: { bold: true },
      },
      {
        type: 'text',
        text: ' - Clean separation between UI and business logic',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'heading',
    props: {
      level: 2,
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: '🔄 How It Works',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'paragraph',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: 'When a protected operation is called:',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'numberedListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: 'Check if user has any session (authenticated or anonymous)',
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'numberedListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: 'If identity exists → proceed with operation',
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'numberedListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: 'If no identity → dispatch auth modal event',
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'numberedListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: 'AuthModalProvider listens and opens modal with context',
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'numberedListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: 'After auth → retry operation automatically',
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'heading',
    props: {
      level: 2,
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: '💡 Best Practices',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'bulletListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: 'Use ',
        styles: {},
      },
      {
        type: 'text',
        text: 'useWithIdentity()',
        styles: { bold: true, code: true },
      },
      {
        type: 'text',
        text: ' hook in React components for best performance',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'bulletListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: 'Provide meaningful ',
        styles: {},
      },
      {
        type: 'text',
        text: 'action',
        styles: { bold: true },
      },
      {
        type: 'text',
        text: ' names for better UX',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'bulletListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: 'Handle errors with ',
        styles: {},
      },
      {
        type: 'text',
        text: 'isIdentityError()',
        styles: { bold: true, code: true },
      ],
      {
        type: 'text',
        text: ' to distinguish auth errors',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'bulletListItem',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: 'Use ',
        styles: {},
      },
      {
        type: 'text',
        text: 'withServerIdentity()',
        styles: { bold: true, code: true },
      },
      {
        type: 'text',
        text: ' in server actions for server-side validation',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'callout',
    props: {
      type: 'warning',
      backgroundColor: 'warning',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: 'Remember: The auth modal opens automatically when no session exists. Users don\'t need to manually trigger authentication.',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'heading',
    props: {
      level: 2,
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: '📚 Example Usage',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'codeBlock',
    props: {
      language: 'typescript',
      backgroundColor: 'default',
      textColor: 'default',
    },
    content: [
      {
        type: 'text',
        text: "// Component example\nfunction NoteEditor() {\n  const withIdentity = useWithIdentity()\n  const [result, setResult] = useState('')\n  \n  const handleCreate = async () => {\n    try {\n      await withIdentity(createNote, {\n        action: 'create-note'\n      })({ name: 'New Note', content: 'Hello' })\n      setResult('✅ Note created!')\n    } catch (error) {\n      if (isIdentityError(error)) {\n        setResult('🔐 Please sign in')\n      } else {\n        setResult(`❌ Error: ${error.message}`)\n      }\n    }\n  }\n  \n  return <button onClick={handleCreate}>Create Note</button>\n}",
      },
    ],
    children: [],
  },
  {
    id: generateId(),
    type: 'paragraph',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: 'This pattern provides a seamless, secure, and user-friendly way to handle authentication across your entire application.',
        styles: {},
      },
    ],
    children: [],
  },
]