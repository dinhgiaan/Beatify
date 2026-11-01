import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../atoms/Button';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || 'Unknown Error';
      const isHookError = errorMessage.includes('#310') || errorMessage.includes('Rendered more hooks') || errorMessage.includes('Rendered fewer hooks');

      return (
        <div className="w-full max-w-[1720px] mx-auto px-8 py-12 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shadow-sm">
            <AlertTriangle size={28} />
          </div>

          <div className="space-y-1.5 max-w-2xl w-full">
            <h3 className="text-base font-bold text-white">
              {this.props.fallbackTitle || 'Đã xảy ra sự cố giao diện'}
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Trang này gặp lỗi không mong muốn trong quá trình kết xuất. Vui lòng tải lại trang hoặc bấm thử lại.
            </p>
            {isHookError && (
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[11.5px] text-amber-300 text-left">
                <strong>Gợi ý gỡ lỗi:</strong> Lỗi React Hooks (#310: Rendered more/fewer hooks than during the previous render).
              </div>
            )}
            {this.state.error && (
              <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] text-[11px] text-rose-300  text-left overflow-x-auto max-h-48 select-all whitespace-pre-wrap">
                {this.state.error.stack || this.state.error.message}
              </div>
            )}
            {this.state.errorInfo?.componentStack && (
              <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] text-[10.5px] text-zinc-400  text-left overflow-x-auto max-h-48 select-all whitespace-pre-wrap">
                {this.state.errorInfo.componentStack}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={this.handleReset}
              className="gap-1.5 font-semibold text-xs"
            >
              <RefreshCw size={13} />
              <span>Thử lại</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
              className="text-xs"
            >
              Tải lại ứng dụng
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
