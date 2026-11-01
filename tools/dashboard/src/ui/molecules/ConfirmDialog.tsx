import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Button } from '../atoms/Button';

export interface ConfirmDialogProps {
  isOpen?: boolean;
  open?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isDestructive?: boolean;
  isLoading?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  open,
  onClose,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = 'Xác nhận xóa',
  cancelText = 'Hủy bỏ',
  variant = 'danger',
  isDestructive,
  isLoading = false,
  maxWidth = 'md',
}) => {
  const visible = open ?? isOpen ?? false;
  const handleClose = () => {
    if (isLoading) return;
    onClose?.();
    onOpenChange?.(false);
  };
  const effectiveVariant = isDestructive ? 'danger' : variant;

  const maxWidthClass =
    maxWidth === 'sm'
      ? 'max-w-sm'
      : maxWidth === 'lg'
      ? 'max-w-lg'
      : maxWidth === 'xl'
      ? 'max-w-xl'
      : 'max-w-md';

  return (
    <RadixDialog.Root open={visible} onOpenChange={(o) => !o && handleClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/75 animate-in fade-in duration-150" />
        <RadixDialog.Content
          className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[94vw] ${maxWidthClass} rounded-2xl p-5 shadow-2xl focus:outline-none border space-y-4 select-none animate-in fade-in slide-in-from-bottom-2 duration-150`}
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border)',
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 shadow-xs ${
                  effectiveVariant === 'danger'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                }`}
              >
                {effectiveVariant === 'danger' ? <Trash2 size={15} /> : <AlertTriangle size={15} />}
              </div>
              <RadixDialog.Title className="text-sm font-bold text-[var(--text-primary)]">
                {title}
              </RadixDialog.Title>
            </div>
            <RadixDialog.Close asChild>
              <button
                type="button"
                disabled={isLoading}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] cursor-pointer disabled:opacity-40 transition-colors"
              >
                <X size={15} />
              </button>
            </RadixDialog.Close>
          </div>

          {/* Description */}
          <RadixDialog.Description asChild>
            <div className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
              {description}
            </div>
          </RadixDialog.Description>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={handleClose}
              disabled={isLoading}
            >
              {cancelText}
            </Button>
            <Button
              variant={effectiveVariant === 'danger' ? 'danger' : 'primary'}
              size="sm"
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
            >
              {effectiveVariant === 'danger' && <Trash2 size={12} />}
              <span>{isLoading ? 'Đang xử lý...' : confirmText}</span>
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
};
