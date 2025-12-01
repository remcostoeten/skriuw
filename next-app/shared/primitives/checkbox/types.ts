import { ReactNode } from 'react';

/**
 * Atimation variant types for the checkbox component
 */
export type CheckboxAnimationVariant = 'fade' | 'scale' | 'bounce' | 'slide' | 'rotate';

/**
 * Checkbox state types
 */
export type CheckboxState = 'unchecked' | 'checked' | 'indeterminate';

/**
 * Checkbox size variants
 */
export type CheckboxSize = 'sm' | 'md' | 'lg';

/**
 * Checkbox style variants
 */
export type CheckboxVariant = 'default' | 'outline' | 'filled' | 'minimal';

/**
 * Custom color configuration for the checkbox
 */
export interface CheckboxColors {
  /** Border color when unchecked */
  borderUnchecked?: string;
  /** Background color when unchecked */
  bgUnchecked?: string;
  /** Border color when checked */
  borderChecked?: string;
  /** Background color when checked */
  bgChecked?: string;
  /** Border color when indeterminate */
  borderIndeterminate?: string;
  /** Background color when indeterminate */
  bgIndeterminate?: string;
  /** Checkmark/indicator color */
  checkmark?: string;
  /** Focus ring color */
  focusRing?: string;
  /** Hover overlay color */
  hover?: string;
}

/**
 * Comprehensive props interface for the Checkbox component
 * Covers all enterprise requirements including accessibility, callbacks, and customization
 */
export interface CheckboxProps {
  /** Controlled checked state */
  checked?: boolean;

  /** Default checked state for uncontrolled usage */
  defaultChecked?: boolean;

  /** Indeterminate/halfway state */
  indeterminate?: boolean;

  /** Disabled state */
  disabled?: boolean;

  /** Loading state (shows loading indicator) */
  loading?: boolean;

  /** Read-only state (visual only, no interaction) */
  readOnly?: boolean;

  /** Required field indicator */
  required?: boolean;

  /** Animation variant */
  variant?: CheckboxVariant;

  /** Size variant */
  size?: CheckboxSize;

  /** Animation style */
  animation?: CheckboxAnimationVariant;

  /** Custom colors */
  colors?: CheckboxColors;

  /** Label text */
  label?: ReactNode;

  /** Label position */
  labelPosition?: 'left' | 'right';

  /** Description/helper text */
  description?: ReactNode;

  /** Error message */
  error?: string;

  /** Custom checked icon */
  checkedIcon?: ReactNode;

  /** Custom indeterminate icon */
  indeterminateIcon?: ReactNode;

  /** Name attribute for form submission */
  name?: string;

  /** Value attribute for form submission */
  value?: string;

  /** ID for the input element */
  id?: string;

  /** Additional CSS classes for the root container */
  className?: string;

  /** Additional CSS classes for the checkbox container */
  checkboxClassName?: string;

  /** Additional CSS classes for the label */
  labelClassName?: string;

  /** Additional CSS classes for the checkmark icon */
  iconClassName?: string;

  /** Tab index for keyboard navigation */
  tabIndex?: number;

  /** Auto focus on mount */
  autoFocus?: boolean;

  /** Whether to show ripple effect on click */
  ripple?: boolean;

  // ============ CALLBACKS ============

  /**
   * Called when the checkbox state changes
   * @param checked - New checked state
   * @param event - React change event
   */
  onChange?: (checked: boolean, event: React.ChangeEvent<HTMLInputElement>) => void;

  /**
   * Called when the checkbox is focused
   */
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;

  /**
   * Called when the checkbox loses focus
   */
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;

  /**
   * Called when a key is pressed while focused
   */
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;

  /**
   * Called when a key is released while focused
   */
  onKeyUp?: (event: React.KeyboardEvent<HTMLInputElement>) => void;

  /**
   * Called on mouse enter
   */
  onMouseEnter?: (event: React.MouseEvent<HTMLDivElement>) => void;

  /**
   * Called on mouse leave
   */
  onMouseLeave?: (event: React.MouseEvent<HTMLDivElement>) => void;

  /**
   * Called when transitioning from indeterminate to checked/unchecked
   */
  onIndeterminateChange?: (wasIndeterminate: boolean) => void;

  // ============ ACCESSIBILITY ============

  /** ARIA label for screen readers */
  'aria-label'?: string;

  /** ARIA labeled by - reference to label element ID */
  'aria-labelledby'?: string;

  /** ARIA described by - reference to description element ID */
  'aria-describedby'?: string;

  /** ARIA invalid state */
  'aria-invalid'?: boolean;

  /** ARIA required state */
  'aria-required'?: boolean;

  /** Additional ARIA attributes */
  [key: `aria-${string}`]: string | boolean | undefined;

  // ============ DATA ATTRIBUTES ============

  /** Custom data attributes */
  [key: `data-${string}`]: string | number | boolean | undefined;
}