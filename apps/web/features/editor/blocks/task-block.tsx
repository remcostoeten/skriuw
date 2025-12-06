import { createReactBlockSpec } from '@blocknote/react'

import { Checkbox } from '@skriuw/ui/primitives/checkbox'

/**
 * Custom Task Block for BlockNote
 *
 * Features:
 * - Custom checkbox using our Checkbox component
 * - Inline content editing
 * - Nested children support (for subtasks)
 * - Slash command: /task
 * - Click task title to open task detail view
 */
export const taskBlockSpec = createReactBlockSpec(
	{
		type: 'task',
		propSchema: {
			checked: {
				default: false,
			},
		},
		content: 'inline',
	},
	{
		render: ({ block, editor, contentRef }) => {
			const checked = block.props.checked as boolean

			return (
				<div
					className="bn-task-block flex items-start gap-2 py-1 group"
					data-content-type="task"
					data-block-id={block.id}
				>
					<div className="shrink-0 mt-0.5">
						<Checkbox
							checked={checked}
							size="sm"
							variant="default"
							onChange={(newChecked) => {
								editor.updateBlock(block.id, {
									props: {
										checked: newChecked,
									},
								})
							}}
						/>
					</div>
					{/* Hide any checkbox rendered by BlockNote's inline content */}
					<style>{`
						.bn-task-block[data-content-type="task"] input[type="checkbox"] {
							display: none !important;
						}
					`}</style>
					<div className="flex-1 min-w-0" ref={contentRef} />
				</div>
			)
		},
		parse: (element) => {
			// Parse HTML elements into task blocks when pasting
			if (
				element.tagName === 'DIV' &&
				(element.getAttribute('data-content-type') === 'task' ||
					element.classList.contains('bn-task-block'))
			) {
				const checkbox = element.querySelector('input[type="checkbox"]')
				const checked = checkbox ? (checkbox as HTMLInputElement).checked : false

				return {
					checked,
				}
			}
			return undefined
		},
		toExternalHTML: ({ block }) => {
			const checked = block.props.checked as boolean
			return (
				<div data-content-type="task" className="bn-task-block" data-checked={checked}>
					<input type="checkbox" checked={checked} readOnly />
					<span>{/* Content will be rendered by BlockNote */}</span>
				</div>
			)
		},
	}
)

