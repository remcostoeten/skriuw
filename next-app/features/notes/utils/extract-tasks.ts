import type { Block } from '@blocknote/core'

export interface ExtractedTask {
	blockId: string
	content: string
	checked: boolean
	parentTaskId: string | null
	position: number
}

/**
 * Extracts text content from a BlockNote block's content array
 */
function extractTextFromContent(content: Block['content']): string {
	if (!content || !Array.isArray(content)) {
		return ''
	}

	return content
		.map((item) => {
			if (typeof item === 'string') {
				return item
			}
			if (item && typeof item === 'object' && 'text' in item) {
				return (item as { text: string }).text
			}
			return ''
		})
		.join('')
		.trim()
}

/**
 * Recursively extracts all tasks from BlockNote blocks
 * Handles both bulletListItem blocks with checked prop and custom task blocks
 */
export function extractTasksFromBlocks(
	blocks: Block[],
	noteId: string,
	parentTaskId: string | null = null,
	startPosition: number = 0
): ExtractedTask[] {
	const tasks: ExtractedTask[] = []
	let position = startPosition

	for (const block of blocks) {
		let isTask = false
		let checked = false
		let content = ''

		// Check if this is a task block (custom task block)
		// Type assertion needed because custom task blocks aren't in default BlockNote types
		const blockType = block.type as string
		if (blockType === 'task') {
			isTask = true
			const blockWithProps = block as unknown as { props?: { checked?: boolean } }
			checked = (blockWithProps.props?.checked as boolean) ?? false
			content = extractTextFromContent(block.content)
		}
		// Check if this is a bulletListItem with checked prop (BlockNote's default task)
		else if (block.type === 'bulletListItem') {
			const blockWithProps = block as unknown as { props?: { checked?: boolean } }
			if (blockWithProps.props && 'checked' in blockWithProps.props) {
				isTask = true
				checked = (blockWithProps.props.checked as boolean) ?? false
				content = extractTextFromContent(block.content)
			}
		}

		if (isTask) {
			tasks.push({
				blockId: block.id,
				content,
				checked,
				parentTaskId,
				position: position++,
			})

			// If this task has children, they might be subtasks
			if (block.children && block.children.length > 0) {
				const childTasks = extractTasksFromBlocks(
					block.children,
					noteId,
					block.id, // Current task becomes parent for children
					position
				)
				tasks.push(...childTasks)
				position += childTasks.length
			}
		} else {
			// Not a task, but check children recursively
			if (block.children && block.children.length > 0) {
				const childTasks = extractTasksFromBlocks(
					block.children,
					noteId,
					parentTaskId, // Keep same parent
					position
				)
				tasks.push(...childTasks)
				position += childTasks.length
			}
		}
	}

	return tasks
}
