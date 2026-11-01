import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  maxWidth?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  maxWidth = 'max-w-md',
}) => {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className="fixed inset-0 z-[10000] bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
        />
        <RadixDialog.Content
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target?.closest?.('[data-player-dock="true"]') || target?.closest?.('#audio-player-dock')) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target?.closest?.('[data-player-dock="true"]') || target?.closest?.('#audio-player-dock')) {
              e.preventDefault();
            }
          }}
          className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10001] w-[95vw] ${maxWidth} max-h-[calc(100vh-32px)] overflow-y-auto rounded-2xl focus:outline-none p-5 sm:p-6 shadow-2xl border animate-in fade-in slide-in-from-bottom-2 duration-150 select-none scrollbar-thin`}
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border)',
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <RadixDialog.Title
                className="text-[14px] font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description
                  className="text-[11.5px] mt-0.5 leading-relaxed"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <button
                type="button"
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                <X size={15} />
              </button>
            </RadixDialog.Close>
          </div>

          {/* Body */}
          <div className="text-[12px]" style={{ color: 'var(--text-primary)' }}>
            {children}
          </div>

          {/* Footer */}
          {actions && (
            <div
              className="flex items-center justify-end gap-2 pt-3 mt-4"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              {actions}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
};
