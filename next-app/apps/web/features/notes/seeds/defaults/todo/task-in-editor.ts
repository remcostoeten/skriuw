import type { DefaultNote } from '@/features/notes/utils/initialize-defaults'

export const taskInEditorNoteSeed: DefaultNote = {
	name: 'Task in editor',
	parentFolderName: 'servo',
	contentMarkdown: `# Task in editor
We want a task system just like Superlist. Tasks are created inside the rich text editor, each task contains its own rich text editor.

Tasks can nest recursively with no depth limit.

- Allow adding checkbox plus label to the task
- Store checked state
- Allow adding subtasks to a task
- Support keyboard shortcuts for fast creation and nesting
- Support drag to reorder
- Persist nested structure efficiently
- Render collapsed and expanded states for deep trees
- Sync state optimistically across clients
- Support slash commands to create tasks
- Support copy, paste, move of nested task blocks
- Keep task blocks isolated for future plugins
- Consider performance for large task trees
`,
}
