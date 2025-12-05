import { createReactBlockSpec } from '@blocknote/react'

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
		render: ({ block }) => {
			const value = block.props.value as string

			return (
				<div className="bn-animated-number-block py-2 group" data-content-type="animated-number">
					<AnimatedNumber
						value={value}
						className="text-2xl font-bold"
						duration={1000}
						staggerDelay={150}
					/>
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
