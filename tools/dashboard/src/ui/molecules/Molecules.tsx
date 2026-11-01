import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Label } from '../atoms/Controls';

export interface FormFieldProps {
  label?: React.ReactNode;
  error?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  description,
  children,
  className,
}) => {
  return (
    <div className={twMerge(clsx('space-y-1', className))}>
      {label && <Label>{label}</Label>}
      {children}
      {description && !error && (
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{description}</p>
      )}
      {error && <p className="text-[11px] text-[var(--danger)] leading-relaxed">{error}</p>}
    </div>
  );
};

export interface StatRowProps {
  label: string;
  value: React.ReactNode;
  subValue?: string;
  className?: string;
}

export const StatRow: React.FC<StatRowProps> = ({ label, value, subValue, className }) => {
  return (
    <div
      className={twMerge(
        clsx(
          'flex items-center justify-between py-2 border-b border-[var(--border)] last:border-b-0',
          className
        )
      )}
    >
      <span className="text-[12px] text-[var(--text-secondary)]">{label}</span>
      <div className="text-right">
        <span className="text-[12px] font-medium text-[var(--text-primary)] tabular-nums">
          {value}
        </span>
        {subValue && (
          <span className="block text-[10.5px] text-[var(--text-muted)]">{subValue}</span>
        )}
      </div>
    </div>
  );
};

export interface NoticeProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'warning' | 'danger' | 'success';
  className?: string;
}

export const Notice: React.FC<NoticeProps> = ({
  children,
  variant = 'neutral',
  className,
}) => {
  const styles = {
    neutral: 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]',
    warning: 'border-[var(--warning-border)] bg-[var(--warning-light)] text-[var(--warning)]',
    danger:  'border-[var(--danger-border)]  bg-[var(--danger-light)]  text-[var(--danger)]',
    success: 'border-[var(--success-border)] bg-[var(--success-light)] text-[var(--success)]',
  };

  return (
    <div
      className={twMerge(
        clsx('p-3 border rounded-lg text-[11.5px] leading-relaxed', styles[variant], className)
      )}
    >
      {children}
    </div>
  );
};

export interface EmptyStateProps {
  icon?: React.ReactNode;
  message: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  message,
  action,
  className,
}) => {
  return (
    <div
      className={twMerge(
        clsx(
          'p-8 text-center border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-subtle)] flex flex-col items-center justify-center gap-2',
          className
        )
      )}
    >
      {icon && <div className="text-[var(--text-muted)]">{icon}</div>}
      <p className="text-[12px] text-[var(--text-muted)]">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};

export { ModuleNavTabs, type ModuleNavTabsProps, type TabItem } from './ModuleNavTabs';
