import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  inputSize?: 'sm' | 'md' | 'lg';
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, inputSize = 'md', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={twMerge(
          clsx(
            'w-full rounded border transition-colors text-[12px]',
            'bg-[var(--bg-surface)] text-[var(--text-primary)]',
            'border-[var(--border)] placeholder:text-[var(--text-muted)]',
            'focus:outline-none focus:border-[var(--primary)]',
            'px-3',
            inputSize === 'sm' ? 'h-7' : inputSize === 'lg' ? 'h-9' : 'h-8',
            className
          )
        )}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={twMerge(
          clsx(
            'w-full rounded border transition-colors text-[12px] p-2.5',
            'bg-[var(--bg-surface)] text-[var(--text-primary)]',
            'border-[var(--border)] placeholder:text-[var(--text-muted)]',
            'focus:outline-none focus:border-[var(--primary)]',
            'resize-y',
            className
          )
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';
