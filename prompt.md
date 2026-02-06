# Feature Implementation: Customizable Note Experience

## Context

"Skriuw" is a note-taking application. We need to implement a user-configurable "Note Creation Experience" that allows users to choose between a "Rich" (Notion-style) and "Simple" (Apple Notes-style) default state for new notes.

## Objective

Implement a "Note Customization" setting tab and update the note creation logic to respect these preferences.

## Affected Files

- `apps/web/features/settings/editor-settings.ts` (Settings definitions)
- `apps/web/features/settings/components/SettingsGroup.tsx` (Settings UI rendering - no changes needed if config-driven)
- `apps/web/features/notes/hooks/use-notes.ts` (Note creation logic)
- `packages/db/src/schema.ts` (Reference for settings storage - key/value based, no schema change needed)

## Requirements

### 1. Settings Configuration (`apps/web/features/settings/editor-settings.ts`)

Add a new Settings Group called "Note Experience" with the following new settings in `EDITOR_SETTINGS`:

1.  **`noteCreationMode`**:
    - **Type**: `enum` ('rich', 'simple')
    - **Default**: `'rich'`
    - **Label**: "Default Note Experience"
    - **Description**: "Choose 'Rich' for cover images and icons, or 'Simple' for a minimal text-only experience."

2.  **`defaultEmoji`**:
    - **Type**: `string` (or a new 'emoji-picker' type if supported, otherwise string)
    - **Default**: (null/empty)
    - **Label**: "Default Emoji"
    - **Description**: "Automatically assign this emoji to new notes. Leave empty for none."

3.  **`enableCoverImages`**:
    - **Type**: `boolean`
    - **Default**: `true`
    - **Label**: "Enable Cover Images"
    - **Description**: "Allow adding cover images to notes."

4.  **`titlePlaceholder`**:
    - **Type**: `string`
    - **Default**: "Untitled Note"
    - **Label**: "Title Placeholder"
    - **Description**: "Placeholder text for the note title."

5.  **`bodyPlaceholder`**:
    - **Type**: `string`
    - **Default**: "" (Empty)
    - **Label**: "Body Placeholder"
    - **Description**: "Placeholder text for the empty note body."

**Action**:

- Add these definitions to the `EDITOR_SETTINGS` array.
- Add a new group object to `EDITOR_SETTINGS_GROUPS` with `category: 'note-experience'`, `title: 'Note Experience'`, and filter for these new settings.

### 2. Note Creation Logic (`apps/web/features/notes/hooks/use-notes.ts`)

Modify the `useNotes` hook to integrate these settings.

**Action**:

- Import `useSettings` from `../../settings/use-settings`.
- Inside `useNotes`, call `const { getSetting } = useSettings()`.
- Update the `createNote` function:
    - Read the user's preferences:
        ```typescript
        const mode = getSetting('noteCreationMode')
        const defaultEmoji = getSetting('defaultEmoji')
        const titlePlaceholder = getSetting('titlePlaceholder')
        // Body placeholder might need to be passed to the editor component later, or pre-filled as content.
        ```
    - **Logic**:
        - If `mode === 'simple'`, force `coverImage` to null and potentially strip icon if desired (though user might want Emoji + Simple).
        - If `defaultEmoji` is set, use it as the `icon` property in the mutation payload (unless `icon` was explicitly passed).
        - Use `titlePlaceholder` as the default name if `name` is undefined.

### 3. Verification

- Go to Settings -> Note Experience (new tab).
- Change "Note Creation Mode" to "Simple".
- Change "Title Placeholder" to "My Great Idea".
- Set a Default Emoji (e.g., 📝).
- Create a new note.
- **Expectation**: The new note should have the title "My Great Idea" (if created without a name) and the emoji 📝, and visually conform to the 'simple' mode (this visual part might require checking the Note Editor component to see if it reads these settings, but focusing on creation logic first).

## Instruction to Agent

Implement the changes described above. Ensure that the default values preserve the current behavior (Rich mode, current defaults) so existing users are not disrupted.
