import { CheckboxAnimationVariant, CheckboxVariant, CheckboxSize } from './types';

/**
 * Style configurations for each checkbox variant
 */
export const checkboxStyles: Record<CheckboxVariant, {
  name: string;
  description: string;
  unchecked: {
    border: string;
    background: string;
  };
  checked: {
    border: string;
    background: string;
  };
  indeterminate: {
    border: string;
    background: string;
  };
}> = {
  default: {
    name: 'Default',
    description: 'Standard checkbox with border and background',
    unchecked: {
      border: 'border-2 border-input',
      background: 'bg-background',
    },
    checked: {
      border: 'border-2 border-primary',
      background: 'bg-primary',
    },
    indeterminate: {
      border: 'border-2 border-primary',
      background: 'bg-primary',
    },
  },
  outline: {
    name: 'Outline',
    description: 'Minimal outline checkbox with transparent background',
    unchecked: {
      border: 'border-2 border-muted-foreground/50',
      background: 'bg-transparent',
    },
    checked: {
      border: 'border-2 border-primary',
      background: 'bg-primary',
    },
    indeterminate: {
      border: 'border-2 border-primary',
      background: 'bg-primary',
    },
  },
  filled: {
    name: 'Filled',
    description: 'Filled checkbox with background even when unchecked',
    unchecked: {
      border: 'border-2 border-muted',
      background: 'bg-muted',
    },
    checked: {
      border: 'border-2 border-primary',
      background: 'bg-primary',
    },
    indeterminate: {
      border: 'border-2 border-primary',
      background: 'bg-primary',
    },
  },
  minimal: {
    name: 'Minimal',
    description: 'Minimalist checkbox with subtle borders',
    unchecked: {
      border: 'border border-muted-foreground/30',
      background: 'bg-transparent',
    },
    checked: {
      border: 'border border-primary',
      background: 'bg-primary',
    },
    indeterminate: {
      border: 'border border-primary',
      background: 'bg-primary',
    },
  },
};

/**
 * Animation configurations for each checkbox animation variant
 */
export const checkboxAnimations: Record<CheckboxAnimationVariant, {
  name: string;
  description: string;
  timing: string;
  duration: string;
  iconTransform: {
    unchecked: string;
    checked: string;
    indeterminate: string;
    transition: string;
  };
  containerTransform?: {
    transition: string;
  };
}> = {
  fade: {
    name: 'Fade',
    description: 'Simple fade in/out animation',
    timing: 'ease-in-out',
    duration: '200ms',
    iconTransform: {
      unchecked: 'opacity-0 scale-50',
      checked: 'opacity-100 scale-100',
      indeterminate: 'opacity-100 scale-100',
      transition: 'all 200ms ease-in-out',
    },
    containerTransform: {
      transition: 'all 200ms ease-in-out',
    },
  },
  scale: {
    name: 'Scale',
    description: 'Scale animation with bounce effect',
    timing: 'cubic-bezier(0.68, -0.2, 0.32, 1.2)',
    duration: '250ms',
    iconTransform: {
      unchecked: 'opacity-0 scale-0',
      checked: 'opacity-100 scale-100',
      indeterminate: 'opacity-100 scale-100',
      transition: 'all 250ms cubic-bezier(0.68, -0.2, 0.32, 1.2)',
    },
    containerTransform: {
      transition: 'all 250ms cubic-bezier(0.68, -0.2, 0.32, 1.2)',
    },
  },
  bounce: {
    name: 'Bounce',
    description: 'Bouncy animation with elastic overshoot',
    timing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    duration: '400ms',
    iconTransform: {
      unchecked: 'opacity-0 scale-0 rotate(-180deg)',
      checked: 'opacity-100 scale-100 rotate(0deg)',
      indeterminate: 'opacity-100 scale-90 rotate(0deg)',
      transition: 'all 400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
    containerTransform: {
      transition: 'all 400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
  },
  slide: {
    name: 'Slide',
    description: 'Slide animation from the side',
    timing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    duration: '300ms',
    iconTransform: {
      unchecked: 'opacity-0 translate-x-[-100%]',
      checked: 'opacity-100 translate-x-0',
      indeterminate: 'opacity-100 translate-x-0',
      transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    },
    containerTransform: {
      transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },
  rotate: {
    name: 'Rotate',
    description: 'Rotation animation with scaling',
    timing: 'cubic-bezier(0.65, 0, 0.35, 1)',
    duration: '350ms',
    iconTransform: {
      unchecked: 'opacity-0 rotate(-45deg) scale-0',
      checked: 'opacity-100 rotate(0deg) scale-100',
      indeterminate: 'opacity-100 rotate(0deg) scale-90',
      transition: 'all 350ms cubic-bezier(0.65, 0, 0.35, 1)',
    },
    containerTransform: {
      transition: 'all 350ms cubic-bezier(0.65, 0, 0.35, 1)',
    },
  },
};

/**
 * Size configurations for the checkbox component
 */
export const checkboxSizes: Record<CheckboxSize, {
  name: string;
  description: string;
  container: {
    width: string;
    height: string;
  };
  label: string;
  labelDescription: string;
  icon: {
    width: string;
    height: string;
  };
  spacing: {
    between: string;
    labelDescription: string;
  };
}> = {
  sm: {
    name: 'Small',
    description: 'Compact checkbox for dense interfaces',
    container: {
      width: 'w-4',
      height: 'h-4',
    },
    label: 'text-sm',
    labelDescription: 'text-xs',
    icon: {
      width: 'w-2.5',
      height: 'h-2.5',
    },
    spacing: {
      between: 'gap-2',
      labelDescription: 'gap-1',
    },
  },
  md: {
    name: 'Medium',
    description: 'Standard checkbox size for most interfaces',
    container: {
      width: 'w-5',
      height: 'h-5',
    },
    label: 'text-base',
    labelDescription: 'text-sm',
    icon: {
      width: 'w-3',
      height: 'h-3',
    },
    spacing: {
      between: 'gap-3',
      labelDescription: 'gap-1.5',
    },
  },
  lg: {
    name: 'Large',
    description: 'Large checkbox for touch interfaces or emphasis',
    container: {
      width: 'w-6',
      height: 'h-6',
    },
    label: 'text-lg',
    labelDescription: 'text-base',
    icon: {
      width: 'w-4',
      height: 'h-4',
    },
    spacing: {
      between: 'gap-4',
      labelDescription: 'gap-2',
    },
  },
};

/**
 * Focus ring styles for each size
 */
export const focusRingStyles: Record<CheckboxSize, {
  ring: string;
  ringOffset: string;
}> = {
  sm: {
    ring: 'ring-1',
    ringOffset: 'ring-offset-1',
  },
  md: {
    ring: 'ring-2',
    ringOffset: 'ring-offset-2',
  },
  lg: {
    ring: 'ring-2',
    ringOffset: 'ring-offset-2',
  },
};