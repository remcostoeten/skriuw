import { SwitchAnimationVariant } from './types';

/**
 * Animation configurations for each switch variant
 * All variants are slide-based with unique bezier curves for distinctive motion
 */
export const switchAnimations: Record<SwitchAnimationVariant, {
  name: string;
  description: string;
  timing: string;
  duration: string;
  thumbTransform: {
    off: string;
    on: string;
    transition: string;
  };
}> = {
  slide: {
    name: 'Slide',
    description: 'Classic smooth slide with balanced ease',
    timing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    duration: '200ms',
    thumbTransform: {
      off: 'translateX(0)',
      on: 'translateX(var(--switch-thumb-travel))',
      transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },
  'slide-snappy': {
    name: 'Slide Snappy',
    description: 'Quick and responsive with sharp acceleration',
    timing: 'cubic-bezier(0.65, 0, 0.35, 1)',
    duration: '150ms',
    thumbTransform: {
      off: 'translateX(0)',
      on: 'translateX(var(--switch-thumb-travel))',
      transition: 'transform 150ms cubic-bezier(0.65, 0, 0.35, 1)',
    },
  },
  'slide-gentle': {
    name: 'Slide Gentle',
    description: 'Soft and relaxed with gradual easing',
    timing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    duration: '300ms',
    thumbTransform: {
      off: 'translateX(0)',
      on: 'translateX(var(--switch-thumb-travel))',
      transition: 'transform 300ms cubic-bezier(0.25, 0.1, 0.25, 1)',
    },
  },
  'slide-elastic': {
    name: 'Slide Elastic',
    description: 'Subtle bounce with elastic overshoot',
    timing: 'cubic-bezier(0.68, -0.2, 0.32, 1.2)',
    duration: '350ms',
    thumbTransform: {
      off: 'translateX(0)',
      on: 'translateX(var(--switch-thumb-travel))',
      transition: 'transform 350ms cubic-bezier(0.68, -0.2, 0.32, 1.2)',
    },
  },
  'slide-linear': {
    name: 'Slide Linear',
    description: 'Constant speed, no acceleration or deceleration',
    timing: 'linear',
    duration: '200ms',
    thumbTransform: {
      off: 'translateX(0)',
      on: 'translateX(var(--switch-thumb-travel))',
      transition: 'transform 200ms linear',
    },
  },
};

/**
 * Size configurations for the switch component
 */
export const switchSizes = {
  sm: {
    track: 'w-9 h-5',
    thumb: 'w-4 h-4',
    thumbOffset: '2px',
    thumbTravel: '16px',
    label: 'text-sm',
  },
  md: {
    track: 'w-11 h-6',
    thumb: 'w-5 h-5',
    thumbOffset: '2px',
    thumbTravel: '20px',
    label: 'text-base',
  },
  lg: {
    track: 'w-14 h-7',
    thumb: 'w-6 h-6',
    thumbOffset: '2px',
    thumbTravel: '28px',
    label: 'text-lg',
  },
};

