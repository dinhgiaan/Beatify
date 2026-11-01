import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  selectSize?: 'sm' | 'md';
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, selectSize = 'md', children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={twMerge(
          clsx(
            'rounded border transition-colors cursor-pointer text-[12px] px-2.5',
            'bg-[var(--bg-surface)] text-[var(--text-primary)]',
            'border-[var(--border)]',
            'focus:outline-none focus:border-[var(--primary)]',
            selectSize === 'sm' ? 'h-7' : 'h-8',
            className
          )
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = 'Select';

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={twMerge(
          clsx(
            'w-4 h-4 rounded border border-[var(--border)] cursor-pointer align-middle',
            'accent-[var(--primary)]',
            className
          )
        )}
        {...props}
      />
    );
  }
);
Checkbox.displayName = 'Checkbox';

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label: React.FC<LabelProps> = ({ className, children, ...props }) => {
  return (
    <label
      className={twMerge(
        clsx('block text-[11.5px] font-medium mb-1 text-[var(--text-secondary)]', className)
      )}
      {...props}
    >
      {children}
    </label>
  );
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'neutral',
  children,
  ...props
}) => {
  const variantStyles = {
    neutral: 'border-[var(--border)] text-[var(--text-secondary)] bg-[var(--bg-subtle)]',
    primary: 'border-[#1DB954]/40 text-[#1DB954] bg-[#1DB954]/10',
    success: 'border-[var(--success-border)] text-[var(--success)] bg-[var(--success-light)]',
    warning: 'border-[var(--warning-border)] text-[var(--warning)] bg-[var(--warning-light)]',
    danger:  'border-[var(--danger-border)]  text-[var(--danger)]  bg-[var(--danger-light)]',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center px-2 py-0.5 text-[10.5px] border rounded font-medium select-none whitespace-nowrap shrink-0 gap-1',
          variantStyles[variant],
          className
        )
      )}
      {...props}
    >
      {children}
    </span>
  );
};

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  current: number;
  total: number;
}

export const Progress: React.FC<ProgressProps> = ({
  className,
  current,
  total,
  ...props
}) => {
  const percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={total}
      className={twMerge(clsx('flex items-center gap-2.5 w-full', className))}
      {...props}
    >
      <div className="flex-1 h-1.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{ width: `${percentage}%`, backgroundColor: 'var(--primary)' }}
        />
      </div>
      <span className="text-[11px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">
        {current}/{total} ({percentage}%)
      </span>
    </div>
  );
};
