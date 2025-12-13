import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@skriuw/shared'

const flexVariants = cva(
	'flex',
	{
		variants: {
			direction: {
				row: 'flex-row',
				'row-reverse': 'flex-row-reverse',
				col: 'flex-col',
				'col-reverse': 'flex-col-reverse',
			},
			wrap: {
				nowrap: 'flex-nowrap',
				wrap: 'flex-wrap',
				'wrap-reverse': 'flex-wrap-reverse',
			},
			justify: {
				start: 'justify-start',
				end: 'justify-end',
				center: 'justify-center',
				between: 'justify-between',
				around: 'justify-around',
				evenly: 'justify-evenly',
			},
			items: {
				start: 'items-start',
				end: 'items-end',
				center: 'items-center',
				baseline: 'items-baseline',
				stretch: 'items-stretch',
			},
			alignContent: {
				start: 'content-start',
				end: 'content-end',
				center: 'content-center',
				between: 'content-between',
				around: 'content-around',
				stretch: 'content-stretch',
			},
			gap: {
				none: 'gap-0',
				'xs': 'gap-1',
				'sm': 'gap-2',
				'md': 'gap-4',
				'lg': 'gap-6',
				'xl': 'gap-8',
				'2xl': 'gap-12',
			},
			flex: {
				none: 'flex-none',
				auto: 'flex-auto',
				'1': 'flex-1',
				'2': 'flex-2',
				'3': 'flex-3',
			},
		},
		defaultVariants: {
			direction: 'row',
			wrap: 'nowrap',
			justify: 'start',
			items: 'stretch',
			alignContent: 'stretch',
			gap: 'none',
			flex: 'auto',
		},
	}
)

// Preset variants for common flex layouts
const flexPresets = {
	// Center content both horizontally and vertically
	center: 'flex items-center justify-center',
	
	// Row layouts
	'row-center': 'flex-row items-center justify-center',
	'row-between': 'flex-row items-center justify-between',
	'row-start': 'flex-row items-start justify-start',
	'row-end': 'flex-row items-end justify-end',
	
	// Column layouts
	'col-center': 'flex-col items-center justify-center',
	'col-between': 'flex-col items-center justify-between',
	'col-start': 'flex-col items-start justify-start',
	'col-end': 'flex-col items-end justify-end',
	
	// Full screen/area layouts
	'full': 'flex items-center justify-center w-full h-full',
	'full-row': 'flex-row items-center justify-center w-full h-full',
	'full-col': 'flex-col items-center justify-center w-full h-full',
	
	// Spacing presets
	'spacious': 'flex gap-lg',
	'compact': 'flex gap-sm',
}

type FlexPreset = keyof typeof flexPresets

export interface FlexProps
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof flexVariants> {
	/**
	 * Responsive variants for different breakpoints
	 */
	responsive?: {
		sm?: Partial<VariantProps<typeof flexVariants>>
		md?: Partial<VariantProps<typeof flexVariants>>
		lg?: Partial<VariantProps<typeof flexVariants>>
		xl?: Partial<VariantProps<typeof flexVariants>>
		'2xl'?: Partial<VariantProps<typeof flexVariants>>
	}
	
	/**
	 * Use a preset flex layout
	 */
	preset?: FlexPreset
	
	/**
	 * Inline flex container
	 */
	inline?: boolean
	
	/**
	 * Whether the flex container should grow to fill available space
	 */
	grow?: boolean
	
	/**
	 * Whether the flex container should shrink when necessary
	 */
	shrink?: boolean
}

const Flex = React.forwardRef<HTMLDivElement, FlexProps>(
	({
		className,
		direction,
		wrap,
		justify,
		items,
		alignContent,
		gap,
		flex,
		responsive,
		preset,
		inline = false,
		grow,
		shrink,
		children,
		...props
	}, ref) => {
		// Build responsive classes
		const responsiveClasses = Object.entries(responsive || {}).map(([breakpoint, variants]) => {
			const breakpointClass = `sm:${breakpoint}` === 'sm:sm' ? 'sm' : 
				`sm:${breakpoint}` === 'sm:md' ? 'md' :
				`sm:${breakpoint}` === 'sm:lg' ? 'lg' :
				`sm:${breakpoint}` === 'sm:xl' ? 'xl' :
				`sm:${breakpoint}` === 'sm:2xl' ? '2xl' : breakpoint
			
			return Object.entries(variants || {}).map(([key, value]) => {
				if (key === 'gap' && value) {
					return `${breakpointClass}:gap-${value}`
				}
				return `${breakpointClass}:${key}-${value}`
			}).join(' ')
		}).join(' ')
		
		// Build flex classes
		const flexClasses = cn(
			inline ? 'inline-flex' : 'flex',
			flexVariants({ direction, wrap, justify, items, alignContent, gap, flex }),
			responsiveClasses,
			preset && flexPresets[preset],
			grow && 'flex-grow',
			shrink && 'flex-shrink',
			className
		)
		
		return (
			<div
				ref={ref}
				className={flexClasses}
				{...props}
			>
				{children}
			</div>
		)
	}
)
Flex.displayName = 'Flex'

// Shorthand components for common flex patterns
export const FlexRow = React.forwardRef<HTMLDivElement, Omit<FlexProps, 'direction'>>(
	({ className, ...props }, ref) => (
		<Flex
			ref={ref}
			direction="row"
			className={className}
			{...props}
		/>
	)
)
FlexRow.displayName = 'FlexRow'

export const FlexCol = React.forwardRef<HTMLDivElement, Omit<FlexProps, 'direction'>>(
	({ className, ...props }, ref) => (
		<Flex
			ref={ref}
			direction="col"
			className={className}
			{...props}
		/>
	)
)
FlexCol.displayName = 'FlexCol'

export const FlexCenter = React.forwardRef<HTMLDivElement, Omit<FlexProps, 'preset' | 'direction' | 'justify' | 'items'>>(
	({ className, ...props }, ref) => (
		<Flex
			ref={ref}
			preset="center"
			className={className}
			{...props}
		/>
	)
)
FlexCenter.displayName = 'FlexCenter'

export const FlexBetween = React.forwardRef<HTMLDivElement, Omit<FlexProps, 'preset' | 'justify'>>(
	({ className, ...props }, ref) => (
		<Flex
			ref={ref}
			preset="row-between"
			className={className}
			{...props}
		/>
	)
)
FlexBetween.displayName = 'FlexBetween'

export { Flex, flexVariants }
