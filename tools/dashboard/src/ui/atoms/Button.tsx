import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center font-medium rounded transition-colors',
    'cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none',
    'text-[12px] leading-none whitespace-nowrap gap-1.5',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: [
          'bg-[var(--primary)] text-[var(--primary-fg)] shadow-sm',
          'hover:bg-[var(--primary-hover)] active:opacity-90',
        ].join(' '),
        secondary: [
          'bg-[var(--bg-surface)] text-[var(--text-primary)]',
          'border border-[var(--border)]',
          'hover:bg-[var(--bg-subtle)] active:bg-[var(--bg-hover)]',
        ].join(' '),
        danger: [
          'bg-[var(--bg-surface)] text-[var(--danger)]',
          'border border-[var(--border)]',
          'hover:bg-[var(--danger-light)] hover:border-[var(--danger-border)]',
        ].join(' '),
        success: [
          'bg-[var(--success)] text-white shadow-sm',
          'hover:opacity-90 active:opacity-80',
        ].join(' '),
        text: [
          'bg-transparent text-[var(--text-primary)]',
          'hover:bg-[var(--bg-subtle)] active:bg-[var(--bg-hover)]',
        ].join(' '),
      },
      size: {
        xs: 'h-6 px-2 text-[10.5px]',
        sm: 'h-7 px-2.5 text-[11.5px]',
        md: 'h-8 px-3 text-[12px]',
        lg: 'h-9 px-4 text-[13px]',
      },
      fullWidth: { true: 'w-full' },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={twMerge(clsx(buttonVariants({ variant, size, fullWidth, className })))}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
