import { ReactNode } from 'react'

/**
 * Animation variant types for the switch component
 * All variants are slide-based with different bezier curves
 */
export type SwitchAnimationVariant =
	| 'slide'
	| 'slide-snappy'
	| 'slide-gentle'
	| 'slide-elastic'
	| 'slide-linear'

/**
 * Switch state types
 */
export type SwitchState = 'off' | 'on' | 'indeterminate'

/**
 * Switch size variants
 */
export type SwitchSize = 'sm' | 'md' | 'lg'

/**
 * Custom color configuration for the switch
 */
export interface SwitchColors {
	/** Track background color when OFF */
	trackOff?: string
	/** Track background color when ON */
	trackOn?: string
	/** Track background color when INDETERMINATE */
	trackIndeterminate?: string
	/** Thumb/knob color */
	thumb?: string
	/** Focus ring color */
	focusRing?: string
}

/**
 * Comprehensive props interface for the Switch component
 * Covers all enterprise requirements including accessibility, callbacks, and customization
 */
export interface SwitchProps {
	/** Controlled checked state */
	checked?: boolean

	/** Default checked state for uncontrolled usage */
	defaultChecked?: boolean

	/** Indeterminate/halfway state */
	indeterminate?: boolean

	/** Disabled state */
	disabled?: boolean

	/** Loading state (shows loading indicator) */
	loading?: boolean

	/** Read-only state (visual only, no interaction) */
	readOnly?: boolean

	/** Required field indicator */
	required?: boolean

	/** Animation variant */
	variant?: SwitchAnimationVariant

	/** Size variant */
	size?: SwitchSize

	/** Custom colors */
	colors?: SwitchColors

	/** Label text */
	label?: ReactNode

	/** Label position */
	labelPosition?: 'left' | 'right'

	/** Description/helper text */
	description?: ReactNode

	/** Error message */
	error?: string

	/** Icon to show in the thumb when ON */
	iconOn?: ReactNode

	/** Icon to show in the thumb when OFF */
	iconOff?: ReactNode

	/** Name attribute for form submission */
	name?: string

	/** Value attribute for form submission */
	value?: string

	/** ID for the input element */
	id?: string

	/** Additional CSS classes for the root container */
	className?: string

	/** Additional CSS classes for the track */
	trackClassName?: string

	/** Additional CSS classes for the thumb */
	thumbClassName?: string

	/** Additional CSS classes for the label */
	labelClassName?: string

	/** Tab index for keyboard navigation */
	tabIndex?: number

	/** Auto focus on mount */
	autoFocus?: boolean

	// ============ CALLBACKS ============

	/**
	 * Called when the switch state changes
	 * @param checked - New checked state
	 * @param event - React change event
	 */
	onChange?: (checked: boolean, event: React.ChangeEvent<HTMLInputElement>) => void

	/**
	 * Alternative callback name for compatibility with Radix API
	 * @param checked - New checked state
	 */
	onCheckedChange?: (checked: boolean) => void

	/**
	 * Called when the switch is focused
	 */
	onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void

	/**
	 * Called when the switch loses focus
	 */
	onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void

	/**
	 * Called when a key is pressed while focused
	 */
	onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void

	/**
	 * Called when a key is released while focused
	 */
	onKeyUp?: (event: React.KeyboardEvent<HTMLInputElement>) => void

	/**
	 * Called on mouse enter
	 */
	onMouseEnter?: (event: React.MouseEvent<HTMLDivElement>) => void

	/**
	 * Called on mouse leave
	 */
	onMouseLeave?: (event: React.MouseEvent<HTMLDivElement>) => void

	/**
	 * Called when transitioning from indeterminate to checked/unchecked
	 */
	onIndeterminateChange?: (wasIndeterminate: boolean) => void

	// ============ ACCESSIBILITY ============

	/** ARIA label for screen readers */
	'aria-label'?: string

	/** ARIA labeled by - reference to label element ID */
	'aria-labelledby'?: string

	/** ARIA described by - reference to description element ID */
	'aria-describedby'?: string

	/** ARIA invalid state */
	'aria-invalid'?: boolean

	/** ARIA required state */
	'aria-required'?: boolean

	/** Additional ARIA attributes */
	[key: `aria-${string}`]: string | boolean | undefined

	// ============ DATA ATTRIBUTES ============

	/** Custom data attributes */
	[key: `data-${string}`]: string | number | boolean | undefined
}
