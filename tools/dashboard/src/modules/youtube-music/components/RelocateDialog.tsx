import React, { useState, useEffect } from 'react';
import { FolderSync, FolderOpen, X, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../../../ui/atoms/Button';
import { Input } from '../../../ui/atoms/Input';
import { browseFolderNativeApi } from '../api';
import type { YoutubeMusicDownloadRecord } from '@music-app/shared';

interface RelocateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  singleItem?: YoutubeMusicDownloadRecord | null;
  onRelocateAuto: (targetDir: string) => Promise<void>;
  onRelocatePrefix: (oldPrefix: string, newPrefix: string) => Promise<void>;
  onRelocateSingle: (id: string, newFullPath: string) => Promise<void>;
  isLoading?: boolean;
}

export const RelocateDialog: React.FC<RelocateDialogProps> = ({
  isOpen,
  onClose,
  singleItem,
  onRelocateAuto,
  onRelocatePrefix,
  onRelocateSingle,
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<'auto' | 'prefix'>('auto');
  const [targetDir, setTargetDir] = useState('');
  const [oldPrefix, setOldPrefix] = useState('');
  const [newPrefix, setNewPrefix] = useState('');
  const [singlePath, setSinglePath] = useState('');

  useEffect(() => {
    if (singleItem) {
      setSinglePath('');
    } else {
      setTargetDir('');
      setOldPrefix('');
      setNewPrefix('');
    }
  }, [singleItem, isOpen]);

  if (!isOpen) return null;

  const handleBrowseTargetDir = async () => {
    try {
      const res = await browseFolderNativeApi(targetDir || undefined);
      if (res.path) {
        setTargetDir(res.path);
      }
    } catch {
      // bỏ qua
    }
  };

  const handleBrowseNewPrefix = async () => {
    try {
      const res = await browseFolderNativeApi(newPrefix || undefined);
      if (res.path) {
        setNewPrefix(res.path);
      }
    } catch {
      // bỏ qua
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 select-none">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#1DB954]/15 border border-[#1DB954]/30 flex items-center justify-center text-[#1DB954] shrink-0">
              <FolderSync size={15} />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-[var(--text-primary)]">
                {singleItem
                  ? `Định vị lại tệp: ${singleItem.title || 'Bài hát'}`
                  : 'Đổi thư mục & Tự động tìm lại tệp'}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] truncate">
                {singleItem
                  ? 'Chỉ định vị trí tệp mới khi bạn đổi tên hoặc di chuyển tệp lẻ'
                  : 'Khôi phục kết nối khi bạn di chuyển thư mục nhạc hoặc đổi tên ổ đĩa'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {singleItem ? (
            /* Chế độ định vị 1 file lẻ */
            <div className="space-y-3">
              <div className="p-3 rounded-lg border border-[var(--border)] bg-black/20 space-y-1 text-xs">
                <div className="font-semibold text-zinc-300">Đường dẫn cũ ghi nhận:</div>
                <div className=" text-[11px] text-zinc-500 break-all">
                  {singleItem.libraryRootPath} / {singleItem.relativeFilePath}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">
                  Đường dẫn tệp âm thanh mới đầy đủ:
                </label>
                <div className="flex gap-2">
                  <Input
                    value={singlePath}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSinglePath(e.target.value)}
                    placeholder="Ví dụ: E:\Music\Meek Mill - Going Bad.m4a"
                    className="flex-1 text-xs "
                    disabled={isLoading}
                  />
                </div>
                <p className="text-[11px] text-zinc-400">
                  Dán đường dẫn đầy đủ đến tệp âm thanh mới trên máy tính của bạn.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <Button variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
                  Hủy
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onRelocateSingle(singleItem.id, singlePath)}
                  disabled={isLoading || !singlePath.trim()}
                  className="bg-[#1DB954] text-black font-bold"
                >
                  {isLoading ? 'Đang cập nhật...' : 'Cập nhật tệp này'}
                </Button>
              </div>
            </div>
          ) : (
            /* Chế độ hàng loạt: Tự động quét hoặc Thay thế tiền tố */
            <div className="space-y-4">
              {/* Tab Selector */}
              <div className="flex p-0.5 rounded-lg border border-[var(--border)] bg-black/30">
                <button
                  type="button"
                  onClick={() => setActiveTab('auto')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-colors cursor-pointer ${activeTab === 'auto'
                      ? 'bg-[#1DB954] text-black shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                    }`}
                >
                  1. Tự động quét & Khớp lại (Khuyên dùng)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('prefix')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-colors cursor-pointer ${activeTab === 'prefix'
                      ? 'bg-[#1DB954] text-black shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                    }`}
                >
                  2. Thay thế tiền tố đường dẫn
                </button>
              </div>

              {activeTab === 'auto' ? (
                /* Tab 1: Auto Scan */
                <div className="space-y-3">
                  <div className="p-3 rounded-lg border border-[#1DB954]/20 bg-[#1DB954]/5 flex gap-2.5 text-xs text-zinc-300">
                    <CheckCircle2 size={16} className="text-[#1DB954] shrink-0 mt-0.5" />
                    <div className="space-y-1 text-[11.5px] leading-relaxed">
                      <span className="font-bold text-white">Cách thức hoạt động thông minh:</span>
                      <p className="text-zinc-400">
                        Chỉ cần chọn thư mục mới (nơi bạn vừa di chuyển nhạc đến). Hệ thống sẽ tự động quét đệ quy và đối chiếu tên tệp, dung lượng để nối lại toàn bộ bài hát bị mất tệp mà không làm xáo trộn bất kỳ dữ liệu nào.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">
                      Thư mục mới cần quét tìm:
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={targetDir}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTargetDir(e.target.value)}
                        placeholder="Nhập hoặc chọn đường dẫn thư mục mới (ví dụ: E:\MySongs)"
                        className="flex-1 text-xs"
                        disabled={isLoading}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleBrowseTargetDir}
                        disabled={isLoading}
                        className="gap-1.5 shrink-0"
                      >
                        <FolderOpen size={14} />
                        <span>Duyệt...</span>
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
                      Hủy bỏ
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onRelocateAuto(targetDir)}
                      disabled={isLoading || !targetDir.trim()}
                      className="bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold gap-1.5"
                    >
                      <Search size={14} />
                      <span>{isLoading ? 'Đang quét tệp...' : 'Bắt đầu quét & Nối lại'}</span>
                    </Button>
                  </div>
                </div>
              ) : (
                /* Tab 2: Replace Prefix */
                <div className="space-y-3">
                  <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 flex gap-2.5 text-xs text-zinc-300">
                    <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-[11.5px] leading-relaxed">
                      <span className="font-bold text-white">Thay thế hàng loạt đường dẫn:</span>
                      <p className="text-zinc-400">
                        Phù hợp khi bạn chuyển toàn bộ thư mục từ ổ đĩa này sang ổ đĩa khác (ví dụ: đổi từ <code className="text-amber-300">D:\Music</code> sang <code className="text-[#1DB954]">E:\Music</code>).
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-300">
                        Đoạn đường dẫn cũ:
                      </label>
                      <Input
                        value={oldPrefix}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOldPrefix(e.target.value)}
                        placeholder="Ví dụ: D:\Downloads\Music"
                        className="text-xs"
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-300">
                        Đổi thành đường dẫn mới:
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={newPrefix}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPrefix(e.target.value)}
                          placeholder="Ví dụ: E:\BeatifyLibrary"
                          className="flex-1 text-xs"
                          disabled={isLoading}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleBrowseNewPrefix}
                          disabled={isLoading}
                          className="gap-1.5 shrink-0"
                        >
                          <FolderOpen size={14} />
                          <span>Duyệt...</span>
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
                      Hủy bỏ
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onRelocatePrefix(oldPrefix, newPrefix)}
                      disabled={isLoading || !oldPrefix.trim() || !newPrefix.trim()}
                      className="bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold"
                    >
                      {isLoading ? 'Đang xử lý...' : 'Áp dụng thay thế'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
