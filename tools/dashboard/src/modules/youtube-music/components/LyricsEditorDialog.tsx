import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  X,
  Check,
  RefreshCw,
  Clipboard,
  Eraser,
  Upload,
  AlignLeft,
  Trash2,
} from 'lucide-react';
import { Button } from '../../../ui/atoms/Button';
import { ConfirmDialog } from '../../../ui/molecules/ConfirmDialog';
import { toast } from 'sonner';
import { fetchLyricsContentApi } from '../api';

export function formatLrcSpacing(text?: string | null): string {
  if (!text) return '';
  return text.replace(/(\[\d{2}:\d{2}(?:\.\d{2,3})?\])([^\s\r\n])/g, '$1 $2');
}

export interface LyricsEditorTrackItem {
  id?: string;
  title?: string | null;
  cleanTitle?: string | null;
  rawTitle?: string;
  artist?: string | null;
  duration?: number | null;
  url?: string;
  sourceUrl?: string;
  lyricsSource?: string | null;
  thumbnailUrl?: string | null;
}

interface LyricsEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  item: LyricsEditorTrackItem | null;
  currentLyrics?: string;
  initialSource?: string;
  onSave: (lyricsText: string) => Promise<void> | void;
  onLyricsFetched?: (lyrics: string, source: string, itemId?: string) => void;
}

const fetchedLyricsMemoryCache = new Map<string, { lyrics: string; source: string }>();

export const LyricsEditorDialog: React.FC<LyricsEditorDialogProps> = ({
  isOpen,
  onClose,
  item,
  currentLyrics,
  initialSource,
  onSave,
  onLyricsFetched,
}) => {
  const [lyricsText, setLyricsText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lyricsSource, setLyricsSource] = useState<string>('none');
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const initialTextRef = useRef('');

  const trackTitle = item?.cleanTitle || item?.title || 'Unknown Title';
  const trackArtist = item?.artist || 'Unknown Artist';
  const trackUrl = item?.url || item?.sourceUrl || '';

  const loadedItemKeyRef = useRef<string | null>(null);
  const onLyricsFetchedRef = useRef(onLyricsFetched);
  onLyricsFetchedRef.current = onLyricsFetched;
  const currentLyricsRef = useRef(currentLyrics);
  currentLyricsRef.current = currentLyrics;
  const initialSourceRef = useRef(initialSource);
  initialSourceRef.current = initialSource;

  const itemKey = isOpen && item ? `${item.id || item.url || item.cleanTitle || item.title || ''}` : null;

  useEffect(() => {
    if (!isOpen || !itemKey || !item) {
      loadedItemKeyRef.current = null;
      return;
    }

    if (loadedItemKeyRef.current === itemKey) {
      return;
    }
    loadedItemKeyRef.current = itemKey;

    const lyricsToInit = currentLyricsRef.current;
    const sourceToInit = initialSourceRef.current;
    const cached = fetchedLyricsMemoryCache.get(itemKey);

    if (lyricsToInit !== undefined) {
      const formatted = formatLrcSpacing(lyricsToInit);
      setLyricsText(formatted);
      initialTextRef.current = formatted;
      setLyricsSource(sourceToInit || (lyricsToInit ? 'custom' : 'none'));
      setIsLoading(false);
      fetchedLyricsMemoryCache.set(itemKey, {
        lyrics: formatted,
        source: sourceToInit || (lyricsToInit ? 'custom' : 'none'),
      });
    } else if (cached !== undefined) {
      const formatted = formatLrcSpacing(cached.lyrics);
      setLyricsText(formatted);
      initialTextRef.current = formatted;
      setLyricsSource(cached.source);
      setIsLoading(false);
    } else if (sourceToInit === 'none' || item.lyricsSource === 'none') {
      setLyricsText('');
      initialTextRef.current = '';
      setLyricsSource('none');
      setIsLoading(false);
      fetchedLyricsMemoryCache.set(itemKey, { lyrics: '', source: 'none' });
    } else {
      setIsLoading(true);
      fetchLyricsContentApi({
        url: trackUrl,
        artist: trackArtist,
        title: trackTitle,
        duration: item.duration || undefined,
      })
        .then((res) => {
          const fetched = formatLrcSpacing(res.syncedLyrics || res.plainLyrics || '');
          fetchedLyricsMemoryCache.set(itemKey, { lyrics: fetched, source: res.source });

          if (loadedItemKeyRef.current !== itemKey) return;
          setLyricsText(fetched);
          initialTextRef.current = fetched;
          setLyricsSource(res.source);
          onLyricsFetchedRef.current?.(fetched, res.source, item.id);
        })
        .catch((err) => {
          if (loadedItemKeyRef.current !== itemKey) return;
          toast.error(`Không thể tải lời bài hát: ${err?.message || 'Lỗi mạng'}`);
        })
        .finally(() => {
          if (loadedItemKeyRef.current === itemKey) {
            setIsLoading(false);
          }
        });
    }
  }, [isOpen, itemKey, item, trackUrl, trackArtist, trackTitle]);

  if (!isOpen || !item) return null;

  const lines = lyricsText.split('\n');
  const totalLines = lyricsText.trim() ? lines.length : 0;
  const syncedLinesCount = lines.filter((l) => /\[\d{2}:\d{2}/.test(l)).length;
  const isSynced = syncedLinesCount > 0;

  const hasUnsavedChanges = lyricsText.trim() !== initialTextRef.current.trim();

  const handleAttemptClose = () => {
    if (hasUnsavedChanges) {
      setIsConfirmDiscardOpen(true);
    } else {
      onClose();
    }
  };

  const handleApply = async () => {
    try {
      setIsSaving(true);
      await onSave(lyricsText.trim());
      initialTextRef.current = lyricsText.trim();
      if (itemKey) {
        fetchedLyricsMemoryCache.set(itemKey, {
          lyrics: lyricsText.trim(),
          source: lyricsText.trim() ? 'custom' : 'none',
        });
      }
      onClose();
    } catch {
      // Handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const formatted = formatLrcSpacing(text);
        setLyricsText(formatted);
        setLyricsSource('custom');
        toast.success('Đã dán lời bài hát từ clipboard!');
      }
    } catch {
      toast.error('Không thể đọc clipboard của trình duyệt.');
    }
  };

  const handleStripTimestamps = () => {
    const stripped = lines
      .map((l) => l.replace(/\[\d{2}:\d{2}(\.\d{2,3})?\]/g, '').trim())
      .filter((l) => l.length > 0)
      .join('\n');
    setLyricsText(stripped);
    toast.success('Đã loại bỏ toàn bộ mốc thời gian!');
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setLyricsText(content);
        setLyricsSource('custom');
        toast.success(`Đã nạp file "${file.name}"!`);
      }
    };
    reader.onerror = () => {
      toast.error('Không thể đọc file đã chọn.');
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.lrc') && !file.name.endsWith('.txt')) {
      toast.error('Vui lòng kéo thả file có đuôi .lrc hoặc .txt');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setLyricsText(content);
        setLyricsSource('custom');
        toast.success(`Đã nạp file "${file.name}"!`);
      }
    };
    reader.onerror = () => {
      toast.error('Không thể đọc file đã kéo thả.');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleReloadOriginal = () => {
    setIsLoading(true);
    fetchLyricsContentApi({
      url: trackUrl,
      artist: trackArtist,
      title: trackTitle,
      duration: item.duration || undefined,
    })
      .then((res) => {
        const fetched = formatLrcSpacing(res.syncedLyrics || res.plainLyrics || '');
        if (itemKey) {
          fetchedLyricsMemoryCache.set(itemKey, { lyrics: fetched, source: res.source });
        }
        setLyricsText(fetched);
        initialTextRef.current = fetched;
        setLyricsSource(res.source);
        onLyricsFetchedRef.current?.(fetched, res.source, item.id);
        if (fetched) {
          toast.success('Đã tải lại lời từ nguồn trực tuyến!');
        } else {
          toast.info('Không tìm thấy lời trên LrcLib hoặc YouTube CC.');
        }
      })
      .catch((err) => {
        toast.error(`Lỗi khi tải lại: ${err?.message}`);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <>
      <AnimatePresence>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 select-none"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleAttemptClose();
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[95vw] max-w-5xl bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[88vh] max-h-[88vh] relative"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#1DB954]/10 text-[#1DB954] shrink-0">
                  <FileText size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[13.5px] font-bold text-[var(--text-primary)] m-0">
                      Xem & Chỉnh sửa Lời bài hát (.lrc)
                    </h3>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                        isSynced
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : totalLines > 0
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {isSynced
                        ? 'Lời đồng bộ (.lrc)'
                        : totalLines > 0
                        ? 'Lời văn bản (Plain Text)'
                        : 'Chưa có lời'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] m-0 mt-0.5 truncate max-w-xl">
                    {trackTitle} • <span className="text-[var(--text-secondary)] font-medium">{trackArtist}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAttemptClose}
                className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            {/* Horizontal Layout Body */}
            <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
              {/* Left Sidebar: Controls & Metadata */}
              <div className="w-full md:w-72 lg:w-80 border-b md:border-b-0 md:border-r border-[var(--border)] bg-[var(--bg-subtle)]/40 p-4 flex flex-col shrink-0 space-y-3 overflow-y-auto min-h-0">
                {/* Track Info Card */}
                <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] space-y-2">
                  <div className="flex items-center gap-3">
                    {item?.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={trackTitle}
                        className="w-11 h-11 rounded-lg object-cover border border-[var(--border)] shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-[var(--bg-hover)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                        <FileText size={18} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-[var(--text-primary)] truncate" title={trackTitle}>
                        {trackTitle}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate" title={trackArtist}>
                        {trackArtist}
                      </div>
                      {item?.duration ? (
                        <div className="text-[10px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                          Thời lượng: {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Source & Stats */}
                  <div className="pt-2 border-t border-[var(--border)] space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between text-[var(--text-muted)]">
                      <span>Nguồn:</span>
                      <span className="font-semibold text-[var(--text-primary)] uppercase text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border)]">
                        {lyricsSource}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[var(--text-muted)]">
                      <span>Đồng bộ:</span>
                      <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                        {syncedLinesCount} / {totalLines} dòng
                      </span>
                    </div>
                    {totalLines > 0 && (
                      <div className="w-full bg-[var(--bg-hover)] h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className="bg-[#1DB954] h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.round((syncedLinesCount / totalLines) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Tools */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block px-1">
                    Công cụ thao tác
                  </span>

                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[11.5px] font-medium cursor-pointer"
                    title="Dán lời bài hát từ clipboard"
                  >
                    <Clipboard size={14} className="text-[#1DB954] shrink-0" />
                    <span>Dán từ Clipboard</span>
                  </button>

                  <label
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[11.5px] font-medium cursor-pointer"
                    title="Nhập file .lrc hoặc .txt từ máy tính"
                  >
                    <Upload size={14} className="text-sky-400 shrink-0" />
                    <span>Nhập tệp .lrc / .txt</span>
                    <input
                      type="file"
                      accept=".lrc,.txt"
                      className="hidden"
                      onChange={handleFileImport}
                    />
                  </label>

                  {isSynced && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const formatted = formatLrcSpacing(lyricsText);
                          setLyricsText(formatted);
                          toast.success('Đã tách khoảng cách giữa mốc giờ và lời bài hát!');
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[11.5px] font-medium cursor-pointer"
                        title="Tự động thêm khoảng cách ngăn cách giữa mốc thời gian [00:00] và câu hát để dễ nhìn"
                      >
                        <AlignLeft size={14} className="text-emerald-400 shrink-0" />
                        <span>Tách khoảng cách mốc giờ</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleStripTimestamps}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[11.5px] font-medium cursor-pointer"
                        title="Chuyển thành lời văn bản thông thường (bỏ mốc giờ)"
                      >
                        <Eraser size={14} className="text-amber-400 shrink-0" />
                        <span>Bỏ mốc thời gian</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handleReloadOriginal}
                    disabled={isLoading}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[11.5px] font-medium cursor-pointer disabled:opacity-50"
                    title="Tải lại từ LrcLib hoặc YouTube CC"
                  >
                    <RefreshCw size={14} className={`text-emerald-400 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Tải lại từ mạng</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!lyricsText.trim()) return;
                      setLyricsText('');
                      toast.info('Đã xóa trắng nội dung soạn thảo.');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 transition-colors text-[11.5px] font-medium cursor-pointer"
                    title="Xóa trắng toàn bộ nội dung trong khung soạn thảo để nhập mới"
                  >
                    <Trash2 size={14} className="text-rose-400 shrink-0" />
                    <span>Xóa trắng nội dung</span>
                  </button>
                </div>
              </div>

              {/* Right Area: Text Editor */}
              <div className="flex-1 min-w-0 min-h-0 flex flex-col p-4 sm:p-5 bg-[var(--bg-surface)] overflow-hidden">
                <div className="flex items-center justify-between pb-2 text-[11px] text-[var(--text-muted)] shrink-0">
                  <span>Trình soạn thảo Lời bài hát (.lrc)</span>
                  <span className="hidden sm:inline italic text-[10px]">
                    Hỗ trợ kéo thả trực tiếp tệp .lrc vào khung
                  </span>
                </div>

                <div className="flex-1 flex flex-col min-h-0 relative">
                  {isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/30">
                      <RefreshCw size={26} className="animate-spin text-[#1DB954]" />
                      <span className="text-[12.5px] font-medium">Đang tìm kiếm lời bài hát từ LrcLib & YouTube CC...</span>
                    </div>
                  ) : (
                    <textarea
                      value={lyricsText}
                      onChange={(e) => setLyricsText(e.target.value)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      placeholder="Dán hoặc nhập lời bài hát tại đây (Hỗ trợ kéo thả file .lrc vào)...&#10;Định dạng đồng bộ: [00:12.34] Lời bài hát&#10;Hoặc định dạng văn bản thuần từng dòng."
                      className={`flex-1 min-h-0 w-full p-4 rounded-xl border text-[13px] leading-relaxed resize-none focus:outline-none transition-colors ${
                        isDragging
                          ? 'border-[#1DB954] bg-[#1DB954]/5 ring-2 ring-[#1DB954]/20'
                          : 'border-[var(--border)] bg-[var(--bg-subtle)]/30 text-[var(--text-primary)] focus:border-[#1DB954] focus:bg-[var(--bg-surface)]'
                      }`}
                      spellCheck={false}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 sticky bottom-0 z-20 flex items-center justify-between px-6 py-3 border-t border-[var(--border)] bg-[var(--bg-subtle)] shadow-lg">
              <span className="text-[11px] text-[var(--text-muted)]">
                {hasUnsavedChanges ? (
                  <span className="text-amber-400 font-medium">• Có thay đổi chưa lưu</span>
                ) : (
                  <span>Nội dung đã sẵn sàng để áp dụng</span>
                )}
              </span>
              <div className="flex items-center gap-2.5">
                <Button variant="secondary" size="sm" onClick={handleAttemptClose} className="px-4">
                  Hủy
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApply}
                  disabled={isLoading || isSaving}
                  className="gap-2 px-5 font-semibold"
                >
                  {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={14} />}
                  <span>Lưu & Áp dụng</span>
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      <ConfirmDialog
        open={isConfirmDiscardOpen}
        onOpenChange={setIsConfirmDiscardOpen}
        title="Hủy các thay đổi lời bài hát?"
        description="Bạn đã chỉnh sửa lời bài hát nhưng chưa lưu lại. Nếu đóng bây giờ, toàn bộ nội dung vừa chỉnh sửa sẽ bị mất."
        confirmText="Hủy thay đổi & Đóng"
        cancelText="Tiếp tục chỉnh sửa"
        variant="warning"
        onConfirm={() => {
          setIsConfirmDiscardOpen(false);
          onClose();
        }}
      />
    </>
  );
};
