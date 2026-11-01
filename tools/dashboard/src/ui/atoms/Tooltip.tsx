import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  className?: string;
  tooltipClassName?: string;
  delay?: number;
  disabled?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  align = 'center',
  className,
  tooltipClassName,
  delay = 120,
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(false);

  const hide = useCallback(() => {
    isHoveredRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const gap = 8;
    let top: number;
    let left: number;

    if (position === 'bottom') {
      top = triggerRect.bottom + gap;
      if (align === 'start') left = triggerRect.left;
      else if (align === 'end') left = triggerRect.right;
      else left = triggerRect.left + triggerRect.width / 2;
    } else if (position === 'top') {
      top = triggerRect.top - gap;
      if (align === 'start') left = triggerRect.left;
      else if (align === 'end') left = triggerRect.right;
      else left = triggerRect.left + triggerRect.width / 2;
    } else if (position === 'left') {
      left = triggerRect.left - gap;
      top = triggerRect.top + triggerRect.height / 2;
    } else {
      left = triggerRect.right + gap;
      top = triggerRect.top + triggerRect.height / 2;
    }

    setCoords({ top, left });
  }, [position, align]);

  const handleMouseEnter = () => {
    if (disabled || !content) return;
    isHoveredRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      // Kiểm tra bảo vệ: Nếu chuột đã rời đi trước khi timer nổ thì tuyệt đối không mở
      if (!isHoveredRef.current) return;
      updatePosition();
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    hide();
  };

  // Khi disabled chuyển sang true, lập tức ẩn tooltip
  useEffect(() => {
    if (disabled) {
      hide();
    }
  }, [disabled, hide]);

  // Đóng tooltip khi cuộn trang hoặc khi click chuột bất kỳ đâu
  useEffect(() => {
    if (!isVisible) return;

    const handleGlobalScrollOrClick = () => {
      hide();
    };

    window.addEventListener('scroll', handleGlobalScrollOrClick, { passive: true, capture: true });
    window.addEventListener('pointerdown', handleGlobalScrollOrClick, { passive: true, capture: true });

    return () => {
      window.removeEventListener('scroll', handleGlobalScrollOrClick, { capture: true });
      window.removeEventListener('pointerdown', handleGlobalScrollOrClick, { capture: true });
    };
  }, [isVisible, hide]);

  // Dọn dẹp timer khi unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Tính transform translate theo alignment
  const getTransformClass = () => {
    if (position === 'bottom') {
      if (align === 'end') return '-translate-x-full';
      if (align === 'start') return 'translate-x-0';
      return '-translate-x-1/2';
    }
    if (position === 'top') {
      if (align === 'end') return '-translate-y-full -translate-x-full';
      if (align === 'start') return '-translate-y-full translate-x-0';
      return '-translate-y-full -translate-x-1/2';
    }
    if (position === 'left') return '-translate-x-full -translate-y-1/2';
    return 'translate-x-0 -translate-y-1/2';
  };

  return (
    <div
      ref={triggerRef}
      className={twMerge(clsx('relative inline-flex items-center', className))}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerEnter={handleMouseEnter}
      onPointerLeave={handleMouseLeave}
    >
      {children}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isVisible && !disabled && content && coords && (
              <motion.div
                ref={tooltipRef}
                initial={{ opacity: 0, y: position === 'top' ? 4 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: position === 'top' ? 4 : -4 }}
                transition={{ duration: 0.1, ease: 'easeOut' }}
                className={twMerge(
                  clsx(
                    'fixed z-[9999] pointer-events-none whitespace-normal text-left shadow-2xl',
                    'rounded-2xl p-3 text-[11.5px] leading-relaxed',
                    'border w-max max-w-[420px]',
                    getTransformClass(),
                    tooltipClassName
                  )
                )}
                style={{
                  top: `${coords.top}px`,
                  left: `${coords.left}px`,
                  backgroundColor: 'rgba(24, 24, 27, 0.95)',
                  borderColor: 'rgba(255, 255, 255, 0.12)',
                  color: 'var(--text-primary)',
                  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};
