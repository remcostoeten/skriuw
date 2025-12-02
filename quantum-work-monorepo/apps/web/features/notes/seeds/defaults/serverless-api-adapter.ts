import type { DefaultNote } from '@/features/notes/utils/initialize-defaults'

export const serverlessApiAdapterSeed = {
	name: 'Serverless API Adapter',
	parentFolderName: 'Development Docs',
	contentMarkdown: `# Serverless API Adapter

The Serverless API Adapter (\`lib/storage/adapters/serverless-api.ts\`) is the current storage implementation that makes HTTP requests to Next.js API routes, which then interact with PostgreSQL via Drizzle ORM.

## Purpose

This adapter bridges the frontend application with the backend API, providing a seamless way to perform CRUD operations through HTTP requests.

## Architecture

\`\`\`
Frontend (React Components)
  ↓
CRUD Functions (read, create, update, destroy)
  ↓
Serverless API Adapter
  ↓
HTTP Requests (fetch)
  ↓
Next.js API Routes (/api/notes, /api/settings, etc.)
  ↓
Drizzle ORM
  ↓
PostgreSQL Database
\`\`\`

## Adapter Creation

\`\`\`typescript
export function createServerlessApiAdapter(
  baseUrl?: string
): GenericStorageAdapter
\`\`\`

**Parameters:**
- \`baseUrl\` - Optional base URL (defaults to \`window.location.origin\`)

**Returns:**
- A \`GenericStorageAdapter\` instance implementing all CRUD operations

## Storage Key Mapping

The adapter maps storage keys to API endpoints:

| Storage Key | API Endpoint | Purpose |
|------------|--------------|---------|
| \`Skriuw_notes\` | \`/api/notes\` | Notes and folders |
| \`app:settings\` | \`/api/settings\` | User settings |
| \`quantum-works:shortcuts:custom\` | \`/api/shortcuts\` | Keyboard shortcuts |

## Core Components

### API Call Function

\`\`\`typescript
const apiCall = async (endpoint: string, options: RequestInit = {})
\`\`\`

**Features:**
- Constructs full URL: \`\${apiBaseUrl}/api\${endpoint}\`
- Handles JSON request/response
- Error parsing and formatting
- Content-Type validation

**Error Handling:**
- Parses error messages from API responses
- Handles non-JSON responses
- Provides descriptive error messages

**Example:**
\`\`\`typescript
const result = await apiCall('/notes', {
  method: 'POST',
  body: JSON.stringify({ name: 'My Note' })
})
\`\`\`

### Event System

\`\`\`typescript
const listeners: StorageEventListener[] = []
const emit = (event: StorageEvent): void => { ... }
\`\`\`

**Purpose:**
- Emits storage events for real-time updates
- Allows components to react to data changes

**Event Types:**
- \`created\` - Entity created
- \`updated\` - Entity updated
- \`deleted\` - Entity deleted

**Example:**
\`\`\`typescript
adapter.addEventListener((event) => {
  if (event.type === 'created' && event.storageKey === 'Skriuw_notes') {
    console.log('New note created:', event.data)
  }
})
\`\`\`

## CRUD Operations Implementation

### Create

\`\`\`typescript
async create<T>(storageKey: string, data: ...): Promise<T>
\`\`\`

**Process:**
1. Maps storage key to API endpoint
2. Removes \`children\` property (not stored in DB)
3. Makes \`POST\` request
4. Emits \`created\` event
5. Returns created entity

**Example:**
\`\`\`typescript
// Storage key: 'Skriuw_notes'
// API call: POST /api/notes
// Body: { name: 'My Note', type: 'note', ... }
\`\`\`

### Read

\`\`\`typescript
async read<T>(storageKey: string, options?: ReadOptions): Promise<T[] | T | undefined>
\`\`\`

**Options:**
- \`getById\` - Get single entity: \`GET /api/notes?id=...\`
- No options - Get all: \`GET /api/notes\`

**Special Handling:**
- Returns \`undefined\` for 404 errors (entity not found)
- Returns array for list operations
- Returns single entity for \`getById\`

**Example:**
\`\`\`typescript
// Get all notes
const notes = await adapter.read('Skriuw_notes')
// API: GET /api/notes

// Get single note
const note = await adapter.read('Skriuw_notes', { getById: 'note-123' })
// API: GET /api/notes?id=note-123
\`\`\`

### Update

\`\`\`typescript
async update<T>(storageKey: string, id: string, data: Partial<T>): Promise<T | undefined>
\`\`\`

**Process:**
1. Maps storage key to API endpoint
2. Makes \`PUT\` request with entity ID and data
3. Emits \`updated\` event
4. Returns updated entity

**Example:**
\`\`\`typescript
// API: PUT /api/notes
// Body: { id: 'note-123', name: 'Updated Name', ... }
\`\`\`

### Delete

\`\`\`typescript
async delete(storageKey: string, id: string): Promise<boolean>
\`\`\`

**Process:**
1. Maps storage key to API endpoint
2. Makes \`DELETE\` request with entity ID
3. Emits \`deleted\` event
4. Returns \`true\` if successful, \`false\` if not found

**Example:**
\`\`\`typescript
// API: DELETE /api/notes?id=note-123
\`\`\`

### Move

\`\`\`typescript
async move<T>(storageKey: string, entityId: string, targetParentId: string | null): Promise<boolean>
\`\`\`

**Process:**
1. Maps storage key to API endpoint
2. Makes \`PUT\` request with move operation
3. Updates \`parentFolderId\` in database
4. Returns \`true\` if successful

**Example:**
\`\`\`typescript
// Move note to folder
// API: PUT /api/notes
// Body: { id: 'note-123', parentFolderId: 'folder-456' }
\`\`\`

## Storage Info

\`\`\`typescript
async getStorageInfo(): Promise<StorageInfo>
\`\`\`

**Returns:**
- Adapter name: \`'serverless-api'\`
- Type: \`'remote'\`
- Total items count (recursive for folders)
- Online status
- Capabilities

**Capabilities:**
\`\`\`typescript
{
  realtime: false,      // No real-time updates
  offline: false,       // Requires network
  sync: true,           // Supports sync
  backup: true,         // Data backed up in DB
  versioning: false,    // No version history
  collaboration: false  // No multi-user support
}
\`\`\`

## Error Handling

### API Errors

\`\`\`typescript
if (!response.ok) {
  // Parse error from response
  const errorJson = JSON.parse(responseText)
  throw new Error(errorJson.message || errorJson.error)
}
\`\`\`

### Network Errors

Network failures are caught and re-thrown with descriptive messages.

### 404 Handling

For \`read\` operations with \`getById\`, 404 errors return \`undefined\` instead of throwing:

\`\`\`typescript
try {
  return await apiCall(\`/notes?id=\${id}\`)
} catch (error) {
  if (message.includes('404') || message.includes('not found')) {
    return undefined  // Entity doesn't exist
  }
  throw error  // Other errors are re-thrown
}
\`\`\`

## Initialization

\`\`\`typescript
async initialize(): Promise<void>
\`\`\`

**Process:**
1. Makes a test request to \`/api/notes\`
2. Verifies API is accessible
3. Throws error if connection fails

**Purpose:**
- Early detection of API issues
- Validates configuration
- Ensures adapter is ready

## Health Check

\`\`\`typescript
async isHealthy(): Promise<boolean>
\`\`\`

**Process:**
1. Makes test request to \`/api/notes\`
2. Returns \`true\` if successful
3. Returns \`false\` if request fails

**Use Cases:**
- Connection status monitoring
- UI indicators
- Retry logic

## Base URL Resolution

\`\`\`typescript
const apiBaseUrl = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
\`\`\`

**Logic:**
1. Use provided \`baseUrl\` if given
2. Fall back to \`window.location.origin\` (current domain)
3. Fall back to empty string (for SSR)

**Examples:**
- Web: \`https://skriuw.vercel.app\`
- Local dev: \`http://localhost:3000\`
- Custom: \`https://api.example.com\`

## Request/Response Format

### Request Headers

\`\`\`typescript
headers: {
  'Content-Type': 'application/json',
  ...options.headers
}
\`\`\`

### Response Validation

\`\`\`typescript
const isJson = contentType?.includes('application/json')
if (!isJson) {
  throw new Error(\`API endpoint returned non-JSON response\`)
}
\`\`\`

## Integration with API Routes

The adapter expects API routes to follow REST conventions:

- \`GET /api/notes\` - List all
- \`GET /api/notes?id=...\` - Get by ID
- \`POST /api/notes\` - Create
- \`PUT /api/notes\` - Update
- \`DELETE /api/notes\` - Delete

## Benefits

1. **Separation of Concerns**
   - Frontend doesn't know about database
   - API routes handle business logic

2. **Type Safety**
   - Full TypeScript support
   - Type-safe request/response

3. **Error Handling**
   - Consistent error format
   - Descriptive error messages

4. **Event System**
   - Real-time update notifications
   - Reactive UI updates

5. **Flexibility**
   - Easy to change API endpoints
   - Can add caching layer
   - Can add retry logic

## Limitations

1. **Requires Network**
   - No offline support
   - Requires API to be available

2. **No Real-time**
   - Polling required for updates
   - No WebSocket support

3. **Single Source**
   - All requests go through API
   - No local caching

## Future Enhancements

Potential improvements:
- Request caching
- Retry logic with exponential backoff
- Request batching
- Optimistic updates
- Offline queue
- WebSocket support for real-time updates

## Summary

The Serverless API Adapter provides a clean HTTP-based interface to the backend API. It handles all CRUD operations, error handling, and event emission, making it easy for the frontend to interact with the database through Next.js API routes.`
} satisfies DefaultNote

