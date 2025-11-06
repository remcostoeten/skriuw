import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        // Static UI variants
        primary: 'bg-neutral-900 shadow-[rgba(0,0,0,0)_0px_0px_0px_0px,_rgba(0,0,0,0)_0px_0px_0px_0px,_rgba(0,0,0,0.1)_0px_1px_3px_0px,_rgba(0,0,0,0.1)_0px_1px_2px_-1px] text-gray-50 hover:bg-neutral-800',
        static: 'bg-neutral-100 shadow-[rgba(0,0,0,0)_0px_0px_0px_0px,_rgba(0,0,0,0)_0px_0px_0px_0px,_rgba(0,0,0,0.05)_0px_1px_2px_0px] text-[rgb(51,_51,_51)] hover:bg-neutral-200',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
        // Static UI size
        static: 'h-[27px] text-[12px] leading-[16px] pt-0 pr-[10px] pb-0 pl-[10px] rounded-[624.9375rem]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  href?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      disabled,
      children,
      href,
      leftIcon,
      rightIcon,
      fullWidth = false,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : href ? 'a' : 'button';

    const buttonClasses = cn(
      buttonVariants({ variant, size, className }),
      {
        'w-full': fullWidth,
        'cursor-not-allowed': loading,
        'gap-2': leftIcon || rightIcon,
      }
    );

    const renderContent = () => (
      <>
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!loading && leftIcon && <span className="inline-flex">{leftIcon}</span>}
        <span className={loading ? 'opacity-75' : ''}>{children}</span>
        {!loading && rightIcon && <span className="inline-flex">{rightIcon}</span>}
      </>
    );

    return (
      <Comp
        className={buttonClasses}
        ref={ref}
        disabled={disabled || loading}
        href={href}
        aria-disabled={disabled || loading}
        aria-describedby={loading ? 'loading-description' : undefined}
        {...props}
      >
        {renderContent()}
        {loading && (
          <span id="loading-description" className="sr-only">
            Loading, please wait
          </span>
        )}
      </Comp>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
