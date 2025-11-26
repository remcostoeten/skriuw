import { Loader2 } from 'lucide-react';
import React, { useId, useRef, useState, useEffect } from 'react';

import { cn } from '@/shared/utilities';

import { SwitchProps, SwitchState } from './types';
import { switchAnimations, switchSizes } from './variants';

/**
 * Enterprise-grade Switch Component
 * 
 * Features:
 * - Full WCAG 2.1 Level AA accessibility compliance
 * - Keyboard navigation (Space, Enter)
 * - Screen reader support with ARIA attributes
 * - Indeterminate/halfway state support
 * - Multiple animation variants with custom bezier curves
 * - Fully customizable colors via props
 * - Dark/light theme support
 * - Loading and disabled states
 * - Comprehensive TypeScript typing
 * - All standard callbacks (onChange, onFocus, onBlur, etc.)
 */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  function Switch(
    {
      checked: controlledChecked,
      defaultChecked = false,
      indeterminate = false,
      disabled = false,
      loading = false,
      readOnly = false,
      required = false,
      variant = 'slide',
      size = 'md',
      colors,
      label,
      labelPosition = 'right',
      description,
      error,
      iconOn,
      iconOff,
      name,
      value,
      id: providedId,
      className,
      trackClassName,
      thumbClassName,
      labelClassName,
      tabIndex,
      autoFocus,
      onChange,
      onCheckedChange,
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
    const generatedId = useId();
    const switchId = providedId || generatedId;
    const descriptionId = description ? `${switchId}-description` : undefined;
    const errorId = error ? `${switchId}-error` : undefined;

    const [internalChecked, setInternalChecked] = useState(defaultChecked);
    const isControlled = controlledChecked !== undefined;
    const checked = isControlled ? controlledChecked : internalChecked;
    
    const [isFocused, setIsFocused] = useState(false);
    const [wasIndeterminate, setWasIndeterminate] = useState(indeterminate);
    
    const inputRef = useRef<HTMLInputElement>(null);
    
    React.useImperativeHandle(ref, () => inputRef.current!);

    const animationConfig = switchAnimations[variant];
    const sizeConfig = switchSizes[size];

    useEffect(() => {
      if (wasIndeterminate !== indeterminate) {
        onIndeterminateChange?.(wasIndeterminate);
        setWasIndeterminate(indeterminate);
      }
    }, [indeterminate, wasIndeterminate, onIndeterminateChange]);

    const state: SwitchState = indeterminate ? 'indeterminate' : checked ? 'on' : 'off';

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled || readOnly || loading) return;

      const newChecked = event.target.checked;
      
      if (!isControlled) {
        setInternalChecked(newChecked);
      }

      onChange?.(newChecked, event);
      onCheckedChange?.(newChecked);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!disabled && !readOnly && !loading) {
          const syntheticEvent = {
            ...event,
            target: { ...inputRef.current!, checked: !checked },
            currentTarget: { ...inputRef.current!, checked: !checked },
          } as React.ChangeEvent<HTMLInputElement>;

          // Handle both callbacks for keyboard events
          if (!isControlled) {
            setInternalChecked(!checked);
          }
          onChange?.(!checked, syntheticEvent);
          onCheckedChange?.(!checked);
        }
      }
      onKeyDown?.(event);
    };

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(event);
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(event);
    };

    const customColorVars: React.CSSProperties = {
      ...(colors?.trackOff && { backgroundColor: colors.trackOff }),
      ...(colors?.trackOn && { '--track-on-color': colors.trackOn }),
      ...(colors?.trackIndeterminate && { '--track-indeterminate-color': colors.trackIndeterminate }),
      ...(colors?.thumb && { backgroundColor: colors.thumb }),
      ...(colors?.focusRing && { '--focus-ring-color': colors.focusRing }),
      '--switch-thumb-travel': sizeConfig.thumbTravel,
    } as React.CSSProperties;

    const ariaAttributes = {
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy || (label && `${switchId}-label`),
      'aria-describedby': ariaDescribedBy || [descriptionId, errorId].filter(Boolean).join(' ') || undefined,
      'aria-invalid': ariaInvalid || !!error,
      'aria-required': ariaRequired || required,
      'aria-checked': (indeterminate ? 'mixed' : checked) as 'mixed' | boolean,
      'aria-disabled': disabled || loading,
      'aria-readonly': readOnly,
      ...Object.keys(restProps)
        .filter(key => key.startsWith('aria-'))
        .reduce((acc, key) => ({ ...acc, [key]: restProps[key as keyof typeof restProps] }), {}),
    };

    const dataAttributes = Object.keys(restProps)
      .filter(key => key.startsWith('data-'))
      .reduce((acc, key) => ({ ...acc, [key]: restProps[key as keyof typeof restProps] }), {});

    const getTrackBgClass = () => {
      if (indeterminate) return 'bg-yellow-500';
      if (checked) return 'bg-primary';
      return 'bg-muted';
    };

    const switchElement = (
      <div
        className={cn(
          'relative inline-flex items-center',
          disabled && 'cursor-not-allowed opacity-50',
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
          role="switch"
          id={switchId}
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
          className={cn(
            'relative rounded-full transition-colors duration-200',
            sizeConfig.track,
            getTrackBgClass(),
            isFocused && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
            trackClassName
          )}
          onClick={() => {
            if (!disabled && !readOnly && !loading) {
              inputRef.current?.click();
            }
          }}
        >
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 rounded-full flex items-center justify-center',
              'bg-background shadow-lg',
              sizeConfig.thumb,
              thumbClassName
            )}
           // MODIFIED TE -50% hEre to test center
            style={{
              left: sizeConfig.thumbOffset,
              transform: checked || indeterminate
                ? `translateY(0%) ${animationConfig.thumbTransform.on}`
                : `translateY(0%) ${animationConfig.thumbTransform.off}`,
              transition: animationConfig.thumbTransform.transition,
            }}
          >
            {loading && (
              <Loader2 className="w-3 h-3 animate-spin text-foreground/60" />
            )}
            
            {!loading && checked && iconOn && (
              <div className="w-full h-full flex items-center justify-center text-foreground/60">
                {iconOn}
              </div>
            )}
            {!loading && !checked && !indeterminate && iconOff && (
              <div className="w-full h-full flex items-center justify-center text-foreground/60">
                {iconOff}
              </div>
            )}
          </div>
        </div>
      </div>
    );

    if (!label && !description && !error) {
      return switchElement;
    }

    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <div className={cn(
          'flex items-center gap-3',
          labelPosition === 'left' && 'flex-row-reverse justify-end'
        )}>
          {switchElement}
          
          {label && (
            <label
              id={`${switchId}-label`}
              htmlFor={switchId}
              className={cn(
                'font-medium leading-none cursor-pointer select-none',
                sizeConfig.label,
                disabled && 'cursor-not-allowed opacity-50',
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
            className="text-sm text-muted-foreground"
          >
            {description}
          </p>
        )}
        
        {error && (
          <p
            id={errorId}
            className="text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

