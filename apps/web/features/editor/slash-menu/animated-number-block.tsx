import { createReactBlockSpec } from '@blocknote/react'
import * as React from 'react'

import { Input } from '@skriuw/ui/input'
import { AnimatedNumber } from '@skriuw/ui/animated-number'

/**
 * Custom Animated Number Block for BlockNote
 *
 * Features:
 * - Animated number display using our AnimatedNumber component
 * - Configurable number value
 * - Slash command: /animated-number
 */
export const animatedNumberBlockSpec = createReactBlockSpec(
	{
		type: 'animated-number',
		propSchema: {
			value: {
				default: '42',
			},
		},
		content: 'none',
	},
	{
		render: ({ block, editor }) => {
			const value = block.props.value as string
			// eslint-disable-next-line react-hooks/rules-of-hooks
			const [isEditing, setIsEditing] = React.useState(false)
			// eslint-disable-next-line react-hooks/rules-of-hooks
			const inputRef = React.useRef<HTMLInputElement>(null)

			// eslint-disable-next-line react-hooks/rules-of-hooks
			React.useEffect(() => {
				if (isEditing && inputRef.current) {
					inputRef.current.focus()
					inputRef.current.select()
				}
			}, [isEditing])

			const handleSave = (newValue: string) => {
				// Only allow numeric input or empty string
				if (newValue === '' || /^\d*$/.test(newValue)) {
					editor.updateBlock(block.id, {
						props: {
							value: newValue,
						},
					})
				}
			}

			const handleKeyDown = (e: React.KeyboardEvent) => {
				if (e.key === 'Enter') {
					setIsEditing(false)
				}
				if (e.key === 'Escape') {
					setIsEditing(false)
				}
			}

			if (isEditing) {
				return (
					<div className="bn-animated-number-block py-2" data-content-type="animated-number">
						<Input
							ref={inputRef}
							value={value}
							onChange={(e) => handleSave(e.target.value)}
							onBlur={() => setIsEditing(false)}
							onKeyDown={handleKeyDown}
							className="text-2xl font-bold h-12 w-32 text-center"
							placeholder="Number"
						/>
					</div>
				)
			}

			return (
				<div
					className="bn-animated-number-block py-2 group cursor-pointer relative"
					data-content-type="animated-number"
					onClick={() => setIsEditing(true)}
					title="Click to edit number"
				>
					<AnimatedNumber
						value={value}
						className="text-2xl font-bold"
						duration={1000}
						staggerDelay={150}
					/>
					<span className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-muted text-muted-foreground px-1 rounded pointer-events-none">
						Edit
					</span>
				</div>
			)
		},
		parse: (element) => {
			// Parse HTML elements into animated number blocks when pasting
			if (
				element.tagName === 'DIV' &&
				(element.getAttribute('data-content-type') === 'animated-number' ||
					element.classList.contains('bn-animated-number-block'))
			) {
				const value = element.getAttribute('data-value') || '42'
				return {
					value,
				}
			}
			return undefined
		},
		toExternalHTML: ({ block }) => {
			const value = block.props.value as string
			return (
				<div
					data-content-type="animated-number"
					className="bn-animated-number-block"
					data-value={value}
				>
					<span>{value}</span>
				</div>
			)
		},
	}
)
