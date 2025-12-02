import React, { useId, useRef, useState, useEffect } from 'react'
import { cn } from '@/shared/utilities'
import { CheckboxProps, CheckboxState } from './types'
import { checkboxStyles, checkboxAnimations, checkboxSizes, focusRingStyles } from './variants'
import { Loader2, Check, Minus } from 'lucide-react'

/**
 * Enterprise-grade Checkbox Component
 *
 * Features:
 * - Full WCAG 2.1 Level AA accessibility compliance
 * - Keyboard navigation (Space, Enter)
 * - Screen reader support with ARIA attributes
 * - Indeterminate/halfway state support
 * - Multiple animation variants with custom bezier curves
 * - Multiple style variants (default, outline, filled, minimal)
 * - Fully customizable colors via props
 * - Dark/light theme support
 * - Loading and disabled states
 * - Custom checkmark and indeterminate icons
 * - Ripple effect support
 * - Comprehensive TypeScript typing
 * - All standard callbacks (onChange, onFocus, onBlur, etc.)
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
	{
		checked: controlledChecked,
		defaultChecked = false,
		indeterminate = false,
		disabled = false,
		loading = false,
		readOnly = false,
		required = false,
		variant = 'default',
		size = 'md',
		animation = 'scale',
		colors,
		label,
		labelPosition = 'right',
		description,
		error,
		checkedIcon,
		indeterminateIcon,
		name,
		value,
		id: providedId,
		className,
		checkboxClassName,
		labelClassName,
		iconClassName,
		tabIndex,
		autoFocus,
		ripple = false,
		onChange,
		onFocus,
		onBlur,
		onKeyDown,
		onKeyUp,
		onMouseEnter,
		onMouseLeave,
		onIndeterminateChange,
		'aria-label': ariaLabel,
		'aria-labelledby': ariaLabelledBy,
		'aria-describedby': ariaDescribedBy,
		'aria-invalid': ariaInvalid,
		'aria-required': ariaRequired,
		...restProps
	},
	ref
) {
	const generatedId = useId()
	const checkboxId = providedId || generatedId
	const descriptionId = description ? `${checkboxId}-description` : undefined
	const errorId = error ? `${checkboxId}-error` : undefined

	const [internalChecked, setInternalChecked] = useState(defaultChecked)
	const isControlled = controlledChecked !== undefined
	const checked = isControlled ? controlledChecked : internalChecked

	const [isFocused, setIsFocused] = useState(false)
	const [wasIndeterminate, setWasIndeterminate] = useState(indeterminate)
	const [rippleActive, setRippleActive] = useState(false)

	const inputRef = useRef<HTMLInputElement>(null)

	React.useImperativeHandle(ref, () => inputRef.current!)

	const styleConfig = checkboxStyles[variant]
	const animationConfig = checkboxAnimations[animation]
	const sizeConfig = checkboxSizes[size]
	const focusConfig = focusRingStyles[size]

	useEffect(() => {
		if (wasIndeterminate !== indeterminate) {
			onIndeterminateChange?.(wasIndeterminate)
			setWasIndeterminate(indeterminate)
		}
	}, [indeterminate, wasIndeterminate, onIndeterminateChange])

	const state: CheckboxState = indeterminate ? 'indeterminate' : checked ? 'checked' : 'unchecked'

	const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		if (disabled || readOnly || loading) return

		const newChecked = event.target.checked

		if (!isControlled) {
			setInternalChecked(newChecked)
		}

		onChange?.(newChecked, event)
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault()
			if (!disabled && !readOnly && !loading) {
				const syntheticEvent = {
					...event,
					target: { ...inputRef.current!, checked: !checked },
					currentTarget: { ...inputRef.current!, checked: !checked },
				} as React.ChangeEvent<HTMLInputElement>
				handleChange(syntheticEvent)
			}
		}
		onKeyDown?.(event)
	}

	const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
		setIsFocused(true)
		onFocus?.(event)
	}

	const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
		setIsFocused(false)
		setRippleActive(false)
		onBlur?.(event)
	}

	const handleRipple = () => {
		if (ripple && !disabled && !readOnly && !loading) {
			setRippleActive(true)
			setTimeout(() => setRippleActive(false), 600)
		}
	}

	const customColorVars: React.CSSProperties = {
		...(colors?.borderUnchecked && { '--checkbox-border-unchecked': colors.borderUnchecked }),
		...(colors?.bgUnchecked && { '--checkbox-bg-unchecked': colors.bgUnchecked }),
		...(colors?.borderChecked && { '--checkbox-border-checked': colors.borderChecked }),
		...(colors?.bgChecked && { '--checkbox-bg-checked': colors.bgChecked }),
		...(colors?.borderIndeterminate && {
			'--checkbox-border-indeterminate': colors.borderIndeterminate,
		}),
		...(colors?.bgIndeterminate && { '--checkbox-bg-indeterminate': colors.bgIndeterminate }),
		...(colors?.checkmark && { '--checkbox-checkmark': colors.checkmark }),
		...(colors?.focusRing && { '--checkbox-focus-ring': colors.focusRing }),
		...(colors?.hover && { '--checkbox-hover': colors.hover }),
	} as React.CSSProperties

	const ariaAttributes = {
		'aria-label': ariaLabel,
		'aria-labelledby': ariaLabelledBy || (label ? `${checkboxId}-label` : undefined),
		'aria-describedby':
			ariaDescribedBy || [descriptionId, errorId].filter(Boolean).join(' ') || undefined,
		'aria-invalid': ariaInvalid || !!error,
		'aria-required': ariaRequired || required,
		'aria-checked': (indeterminate ? 'mixed' : checked) as 'mixed' | boolean,
		'aria-disabled': disabled || loading,
		'aria-readonly': readOnly,
		...Object.keys(restProps)
			.filter((key) => key.startsWith('aria-'))
			.reduce((acc, key) => ({ ...acc, [key]: restProps[key as keyof typeof restProps] }), {}),
	}

	const dataAttributes = Object.keys(restProps)
		.filter((key) => key.startsWith('data-'))
		.reduce((acc, key) => ({ ...acc, [key]: restProps[key as keyof typeof restProps] }), {})

	const getStateClasses = () => {
		const stateConfig =
			state === 'indeterminate'
				? styleConfig.indeterminate
				: state === 'checked'
					? styleConfig.checked
					: styleConfig.unchecked

		return cn(
			stateConfig.border,
			stateConfig.background,
			'relative flex items-center justify-center rounded cursor-pointer transition-all',
			sizeConfig.container.width,
			sizeConfig.container.height,
			disabled && 'cursor-not-allowed opacity-50',
			!disabled && !readOnly && !loading && 'hover:border-primary/80',
			isFocused &&
				`${focusConfig.ring} ${focusConfig.ringOffset} ring-[hsl(var(--checkbox-focus-ring,var(--ring)))] ring-offset-background`,
			checkboxClassName,
			animationConfig.containerTransform?.transition
		)
	}

	const getIconClasses = () => {
		const iconState =
			state === 'indeterminate' ? 'indeterminate' : state === 'checked' ? 'checked' : 'unchecked'

		return cn(
			'absolute flex items-center justify-center text-[hsl(var(--checkbox-checkmark,var(--primary-foreground)))]',
			sizeConfig.icon.width,
			sizeConfig.icon.height,
			iconState === 'unchecked' && animationConfig.iconTransform.unchecked,
			iconState === 'checked' && animationConfig.iconTransform.checked,
			iconState === 'indeterminate' && animationConfig.iconTransform.indeterminate,
			iconClassName,
			animationConfig.iconTransform.transition
		)
	}

	const defaultCheckedIcon = <Check className="w-full h-full" />
	const defaultIndeterminateIcon = <Minus className="w-full h-full" />

	const checkboxElement = (
		<div
			className={cn(
				'flex items-center',
				sizeConfig.spacing.between,
				disabled && 'cursor-not-allowed opacity-[var(--checkbox-disabled-opacity)]',
				!disabled && !readOnly && !loading && 'cursor-pointer',
				className
			)}
			style={customColorVars}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			{...dataAttributes}
		>
			<input
				ref={inputRef}
				type="checkbox"
				id={checkboxId}
				name={name}
				value={value}
				checked={checked}
				disabled={disabled || loading}
				readOnly={readOnly}
				required={required}
				tabIndex={tabIndex}
				autoFocus={autoFocus}
				onChange={handleChange}
				onFocus={handleFocus}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
				onKeyUp={onKeyUp}
				className="sr-only"
				{...ariaAttributes}
			/>

			<div
				className={getStateClasses()}
				onClick={() => {
					if (!disabled && !readOnly && !loading) {
						handleRipple()
						inputRef.current?.click()
					}
				}}
			>
				{loading && (
					<Loader2
						className={cn(
							'absolute w-full h-full animate-spin text-[hsl(var(--checkbox-checkmark,var(--primary-foreground)))]',
							sizeConfig.icon.width,
							sizeConfig.icon.height
						)}
					/>
				)}

				{!loading && state === 'checked' && (
					<div className={getIconClasses()}>{checkedIcon || defaultCheckedIcon}</div>
				)}

				{!loading && state === 'indeterminate' && (
					<div className={getIconClasses()}>{indeterminateIcon || defaultIndeterminateIcon}</div>
				)}

				{ripple && rippleActive && (
					<div className="absolute inset-0 bg-[hsl(var(--checkbox-hover,var(--primary-20)))] rounded animate-ping" />
				)}
			</div>
		</div>
	)

	if (!label && !description && !error) {
		return checkboxElement
	}

	return (
		<div className={cn('flex flex-col', className)}>
			<div
				className={cn(
					'flex items-center',
					sizeConfig.spacing.between,
					labelPosition === 'left' && 'flex-row-reverse justify-end'
				)}
			>
				{checkboxElement}

				{label && (
					<label
						id={`${checkboxId}-label`}
						htmlFor={checkboxId}
						className={cn(
							'font-medium leading-none cursor-pointer select-none',
							sizeConfig.label,
							disabled && 'cursor-not-allowed opacity-[var(--checkbox-disabled-opacity)]',
							labelClassName
						)}
					>
						{label}
						{required && <span className="ml-1 text-destructive">*</span>}
					</label>
				)}
			</div>

			{description && (
				<p
					id={descriptionId}
					className={cn(
						'text-muted-foreground',
						sizeConfig.spacing.labelDescription,
						sizeConfig.description
					)}
				>
					{description}
				</p>
			)}

			{error && (
				<p id={errorId} className="text-sm text-destructive" role="alert">
					{error}
				</p>
			)}
		</div>
	)
})
