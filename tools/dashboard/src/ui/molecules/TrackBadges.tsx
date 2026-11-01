import React from 'react';
import { CheckCircle2, Clock, FileText, AlertCircle } from 'lucide-react';
import { formatDownloadDate } from '../../core/formatters';

export interface AudioFormatBadgeProps {
  format?: string;
  className?: string;
}

export const AudioFormatBadge: React.FC<AudioFormatBadgeProps> = ({ format, className = '' }) => {
  const fmt = (format || 'm4a').toLowerCase();
  const colorStyles =
    fmt === 'opus'
      ? 'bg-purple-500/10 border-purple-500/25 text-purple-400'
      : fmt === 'm4a'
        ? 'bg-blue-500/10 border-blue-500/25 text-blue-400'
        : fmt === 'flac'
          ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
          : 'bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-secondary)]';

  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px]  font-semibold border uppercase shrink-0 ${colorStyles} ${className}`}
    >
      {fmt}
    </span>
  );
};

export interface StorageStatusBadgeProps {
  fileExists?: boolean;
  uploadedToR2?: boolean;
  className?: string;
  showIcon?: boolean;
}

export const StorageStatusBadge: React.FC<StorageStatusBadgeProps> = ({
  fileExists,
  uploadedToR2,
  className = '',
  showIcon = true,
}) => {
  if (fileExists === false) {
    return (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/25 font-bold shrink-0 ${className}`}
        title="Tệp âm thanh không còn tồn tại trên ổ cứng máy tính"
      >
        Mất tệp
      </span>
    );
  }

  if (uploadedToR2) {
    return (
      <span
        className={`text-[10.5px] text-sky-400 flex items-center gap-1 font-medium shrink-0 ${className}`}
        title="Đã đồng bộ lên Cloudflare R2"
      >
        {showIcon && <CheckCircle2 size={11} />}
        <span>R2 Cloud</span>
      </span>
    );
  }

  return (
    <span
      className={`text-[10.5px] text-amber-400 font-medium shrink-0 ${className}`}
      title="Đang lưu cục bộ trên ổ cứng máy tính, chưa tải lên R2"
    >
      Cục bộ
    </span>
  );
};

export interface DownloadTimeDisplayProps {
  dateStr?: string | null;
  compact?: boolean;
  showIcon?: boolean;
  className?: string;
}

export const DownloadTimeDisplay: React.FC<DownloadTimeDisplayProps> = ({
  dateStr,
  compact = false,
  showIcon = false,
  className = '',
}) => {
  const { date, time, full, relative } = formatDownloadDate(dateStr);

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]  tabular-nums ${className}`}
        title={`Thời gian tải: ${full}`}
      >
        {showIcon && <Clock size={11} className="shrink-0 opacity-70" />}
        <span>{time}</span>
        <span className="opacity-50">•</span>
        <span>{date}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center text-center tabular-nums leading-tight cursor-default ${className}`}
      title={`Thời gian tải: ${full} (${relative})`}
    >
      <span className="text-xs font-semibold text-[var(--text-secondary)] ">{time}</span>
      <span className="text-[10px] text-[var(--text-muted)] ">{date}</span>
    </div>
  );
};

export interface LyricsBadgeProps {
  lyricsExists?: boolean;
  lyricsSource?: string;
  onClick?: () => void;
  className?: string;
}

export const LyricsBadge: React.FC<LyricsBadgeProps> = ({
  lyricsExists,
  lyricsSource,
  onClick,
  className = '',
}) => {
  const isLrc =
    lyricsExists ||
    lyricsSource === 'lrclib-synced' ||
    lyricsSource === 'yt-subs' ||
    (lyricsSource && lyricsSource !== 'none' && lyricsSource !== 'lrclib-plain');

  const isPlain = lyricsSource === 'lrclib-plain';

  const content = isLrc ? (
    <span className="inline-flex items-center justify-center gap-1 w-full py-1 rounded-md text-[11px] font-semibold border bg-emerald-500/10 border-emerald-500/25 text-emerald-400">
      <CheckCircle2 size={11} className="shrink-0" />
      <span>.lrc</span>
    </span>
  ) : isPlain ? (
    <span className="inline-flex items-center justify-center gap-1 w-full py-1 rounded-md text-[11px] font-semibold border bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-secondary)]">
      <FileText size={11} className="shrink-0" />
      <span>Plain</span>
    </span>
  ) : (
    <span className="inline-flex items-center justify-center gap-1 w-full py-1 rounded-md text-[11px] font-semibold border bg-rose-500/15 border-rose-500/30 text-rose-400">
      <AlertCircle size={11} className="shrink-0" />
      <span>Thiếu lời</span>
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full cursor-pointer hover:opacity-85 transition-opacity ${className}`}
        title="Bấm để xem và chỉnh sửa lời bài hát"
      >
        {content}
      </button>
    );
  }

  return <div className={`w-full ${className}`}>{content}</div>;
};

