import { createReactBlockSpec } from '@blocknote/react'
import { ArrowUpRight } from 'lucide-react'

import { Checkbox } from '@skriuw/ui/primitives/checkbox'
import { useUIStore } from '@/stores/ui-store'

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
export const taskBlockSpec: any = createReactBlockSpec(
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
			const children = block.children;
			const totalSubtasks = children.length;
			const completedSubtasks = children.filter(child => child.props.checked).length;
			const hasSubtasks = totalSubtasks > 0;

			return (
				<div
					className="bn-task-block flex items-center px-2 gap-3 py-1 group relative w-full"
					data-content-type="task"
					data-block-id={block.id}
				>
					<div className="shrink-0 mt-0.5 flex items-center">
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

					{/* Middle: Content & Metadata */}
					<div className="flex-1 min-w-0 flex flex-col gap-0.5">
						{/* Content Area */}
						<div className="w-full text-base" ref={contentRef} />

						{/* Metadata Row */}
						{hasSubtasks && (
							<div className="flex items-center gap-3 text-xs text-muted-foreground select-none">
								<div className="flex items-center gap-1">
									{/* Simple pie/circle icon or check icon for subtasks */}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										className="opacity-70"
									>
										<path d="M8 6h13" />
										<path d="M8 12h13" />
										<path d="M8 18h13" />
										<path d="M3 6h.01" />
										<path d="M3 12h.01" />
										<path d="M3 18h.01" />
									</svg>
									<span>{completedSubtasks}/{totalSubtasks}</span>
								</div>
							</div>
						)}
					</div>

					{/* Right: Open Detail Action */}
					<div
						role="button"
						tabIndex={0}
						onClick={(e) => {
							e.stopPropagation()
							e.preventDefault()
							useUIStore.getState().openTaskPanel(block.id)
						}}
						className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
						title="Open task details"
					>
						{/* Circle Arrow Right Icon */}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<circle cx="12" cy="12" r="10" />
							<path d="M8 12h8" />
							<path d="M12 16l4-4-4-4" />
						</svg>
					</div>

					{/* Hide any checkbox rendered by BlockNote's inline content */}
					<style>{`
						.bn-task-block[data-content-type="task"] input[type="checkbox"] {
							display: none !important;
						}
					`}</style>
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

