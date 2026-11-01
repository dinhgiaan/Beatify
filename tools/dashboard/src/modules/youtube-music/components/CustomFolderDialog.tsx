import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  RotateCcw,
  X,
  Check,
  Loader2,
  HardDrive,
  ChevronRight,
  ArrowUp,
  RefreshCw,
  Edit2,
  ExternalLink,
  Sparkles,
  History,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../../../ui/atoms/Button';
import { requestApi } from '../../../core/api-client';
import { toast } from 'sonner';

interface ExploreDirectoryItem {
  name: string;
  path: string;
  hasSubfolders: boolean;
  subCount: number;
}

interface ExploreResponse {
  currentPath: string;
  parentPath: string | null;
  breadcrumbs: { name: string; path: string }[];
  directories: ExploreDirectoryItem[];
  availableDrives: string[];
  quickRoots: { name: string; path: string }[];
}

interface CustomFolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  initialFolder?: string;
  folderHistory: string[];
  suggestedFolder?: string;
  onApply: (folder: string) => void;
  onResetDefault: () => void;
}

export const CustomFolderDialog: React.FC<CustomFolderDialogProps> = ({
  isOpen,
  onClose,
  selectedCount,
  initialFolder = '',
  folderHistory = [],
  suggestedFolder,
  onApply,
  onResetDefault,
}) => {
  // Navigation & Data States
  const [currentPath, setCurrentPath] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [breadcrumbs, setBreadcrumbs] = useState<{ name: string; path: string }[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<ExploreDirectoryItem[]>([]);
  const [availableDrives, setAvailableDrives] = useState<string[]>([]);
  const [quickRoots, setQuickRoots] = useState<{ name: string; path: string }[]>([]);

  // Action States
  const [isLoading, setIsLoading] = useState(false);
  const [isPickingNative, setIsPickingNative] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingSubmitting, setIsCreatingSubmitting] = useState(false);

  // Rename States
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenamingSubmitting, setIsRenamingSubmitting] = useState(false);

  // Delete States
  const [deletingItem, setDeletingItem] = useState<{ path: string; name: string } | null>(null);
  const [isDeletingSubmitting, setIsDeletingSubmitting] = useState(false);

  // Khám phá thư mục
  const loadDirectory = useCallback(async (targetPath?: string) => {
    setIsLoading(true);
    try {
      const url = targetPath
        ? `/local-api/fs/explore?path=${encodeURIComponent(targetPath)}`
        : '/local-api/fs/explore';
      const res = await requestApi<ExploreResponse>(url);
      if (res) {
        setCurrentPath(res.currentPath);
        setSelectedPath(res.currentPath);
        setParentPath(res.parentPath);
        setBreadcrumbs(res.breadcrumbs || []);
        setDirectories(res.directories || []);
        setAvailableDrives(res.availableDrives || []);
        setQuickRoots(res.quickRoots || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Không thể mở thư mục: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Khởi tạo khi mở Dialog
  useEffect(() => {
    if (isOpen) {
      setIsCreating(false);
      setEditingPath(null);
      setDeletingItem(null);
      setNewFolderName('');
      const startPath = initialFolder || suggestedFolder || '';
      loadDirectory(startPath);
    }
  }, [isOpen, initialFolder, suggestedFolder, loadDirectory]);

  if (!isOpen) return null;

  // Tìm item con đang được chọn (nếu người dùng nhấp chọn 1 item trong danh sách)
  const selectedSubItem = directories.find((d) => d.path.toLowerCase() === selectedPath.toLowerCase());
  const editingItem = directories.find((d) => d.path === editingPath);

  // Tạo thư mục mới
  const handleCreateFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = newFolderName.trim();
    if (!name) {
      toast.error('Vui lòng nhập tên thư mục mới');
      return;
    }

    // Kiểm tra trùng tên ngay tại client
    const isDuplicate = directories.some((d) => d.name.toLowerCase() === name.toLowerCase());
    if (isDuplicate) {
      toast.error(`⚠️ Thư mục "${name}" đã tồn tại ở vị trí này. Vui lòng chọn tên khác!`);
      return;
    }

    setIsCreatingSubmitting(true);
    try {
      const res = await requestApi<{ createdPath: string; name: string; message: string }>('/local-api/fs/mkdir', {
        method: 'POST',
        body: JSON.stringify({ parentPath: currentPath, folderName: name }),
      });
      toast.success(res.message || `Đã tạo thư mục "${name}"`);
      setIsCreating(false);
      setNewFolderName('');
      await loadDirectory(currentPath);
      if (res.createdPath) {
        setSelectedPath(res.createdPath);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('tồn tại')) {
        toast.error(`⚠️ Thư mục "${name}" đã tồn tại. Vui lòng chọn tên khác!`);
      } else {
        toast.error(`Không thể tạo thư mục: ${msg}`);
      }
    } finally {
      setIsCreatingSubmitting(false);
    }
  };

  // Đổi tên thư mục (Rename)
  const handleRenameFolder = async (targetItemPath: string) => {
    const name = renameValue.trim();
    if (!name) {
      toast.error('Vui lòng nhập tên mới cho thư mục');
      return;
    }

    const currentItem = directories.find((d) => d.path === targetItemPath);
    if (currentItem && currentItem.name === name) {
      setEditingPath(null);
      setRenameValue('');
      return;
    }

    // Kiểm tra trùng tên ở cùng cấp
    const isDuplicate = directories.some(
      (d) => d.path !== targetItemPath && d.name.toLowerCase() === name.toLowerCase()
    );
    if (isDuplicate) {
      toast.error(`⚠️ Thư mục "${name}" đã tồn tại ở vị trí này. Vui lòng đặt tên khác!`);
      return; // Giữ nguyên form để người dùng sửa lại
    }

    setIsRenamingSubmitting(true);
    try {
      const res = await requestApi<{ newPath: string; name: string; message: string }>('/local-api/fs/rename', {
        method: 'POST',
        body: JSON.stringify({ currentPath: targetItemPath, newName: name }),
      });
      toast.success(res.message || `Đã đổi tên thư mục thành "${name}"`);
      setEditingPath(null);
      setRenameValue('');
      await loadDirectory(currentPath);
      if (res.newPath) {
        setSelectedPath(res.newPath);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('tồn tại')) {
        toast.error(`⚠️ Tên thư mục "${name}" đã tồn tại ở thư mục cha. Vui lòng chọn tên khác!`);
      } else {
        toast.error(`Không thể đổi tên thư mục: ${msg}`);
      }
      // Giữ nguyên editingPath để người dùng không phải bấm sửa lại từ đầu
    } finally {
      setIsRenamingSubmitting(false);
    }
  };

  // Xóa thư mục (Delete)
  const handleDeleteFolder = async () => {
    if (!deletingItem) return;
    setIsDeletingSubmitting(true);
    try {
      const res = await requestApi<{ deletedPath: string; name: string; message: string }>('/local-api/fs/delete', {
        method: 'POST',
        body: JSON.stringify({ folderPath: deletingItem.path }),
      });
      toast.success(res.message || `Đã xóa thư mục "${deletingItem.name}"`);
      setDeletingItem(null);
      if (selectedPath.toLowerCase().startsWith(deletingItem.path.toLowerCase())) {
        setSelectedPath(currentPath);
      }
      await loadDirectory(currentPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Không thể xóa thư mục: ${msg}`);
    } finally {
      setIsDeletingSubmitting(false);
    }
  };

  // Mở hộp thoại chọn Windows Explorer (Native Fallback)
  const handleNativePick = async () => {
    setIsPickingNative(true);
    try {
      const res = await requestApi<{ path: string | null }>('/local-api/browse-folder', {
        method: 'POST',
        body: JSON.stringify({ initialPath: currentPath }),
      });
      if (res?.path) {
        await loadDirectory(res.path);
        setSelectedPath(res.path);
        toast.success(`Đã chọn: ${res.path}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Không thể mở hộp thoại Windows: ${msg}`);
    } finally {
      setIsPickingNative(false);
    }
  };

  const handleApply = (targetFolder?: string) => {
    const finalChoice = (targetFolder || selectedPath || currentPath).trim();
    if (!finalChoice) {
      toast.error('Chưa có thư mục nào được chọn');
      return;
    }
    onApply(finalChoice);
    onClose();
  };

  const handleReset = () => {
    onResetDefault();
    onClose();
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
          className="w-[98vw] max-w-6xl xl:max-w-7xl bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[88vh] max-h-[88vh] relative"
        >
          {/* 1. Header */}
          <div className="shrink-0 flex items-center justify-between px-6 py-3.5 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[#1DB954]/10 text-[#1DB954] shrink-0">
                <FolderOpen size={18} />
              </div>
              <div>
                <h3 className="text-[13.5px] font-bold text-[var(--text-primary)] m-0 flex items-center gap-2">
                  <span>Trình quản lý & Chọn thư mục lưu trữ</span>
                  <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-secondary)]">
                    {selectedCount > 1 ? `Áp dụng cho ${selectedCount} bài hát` : 'Áp dụng cho bài hát này'}
                  </span>
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] m-0 mt-0.5">
                  Duyệt cấu trúc thư mục, tạo folder mới, đổi tên hoặc xóa trực tiếp trên Web mà không cần mở Windows Explorer
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title="Đóng"
            >
              <X size={18} />
            </button>
          </div>

          {/* 2. Navigation & Action Bar */}
          <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-[var(--border)] bg-[var(--bg-subtle)]/70 gap-2 flex-wrap text-xs">
            {/* Breadcrumb Path Bar */}
            <div className="flex-1 flex items-center gap-1 overflow-x-auto py-1 scrollbar-none text-[11px] font-mono">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => parentPath && loadDirectory(parentPath)}
                disabled={!parentPath || isLoading}
                className="h-7 w-7 p-0 flex items-center justify-center shrink-0 cursor-pointer"
                title="Lùi về thư mục cha"
              >
                <ArrowUp size={12} />
              </Button>

              <div className="flex items-center gap-1 bg-[var(--bg-surface)] px-2 py-1 rounded-lg border border-[var(--border)] shrink-0 max-w-full overflow-x-auto">
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.path}>
                    {idx > 0 && <ChevronRight size={10} className="text-[var(--text-muted)] shrink-0" />}
                    <button
                      type="button"
                      onClick={() => loadDirectory(crumb.path)}
                      className={`hover:text-[#1DB954] hover:underline cursor-pointer truncate max-w-[170px] ${
                        crumb.path.toLowerCase() === currentPath.toLowerCase() ? 'text-[#1DB954] font-bold' : 'text-[var(--text-secondary)]'
                      }`}
                      title={crumb.path}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Quick Actions in Current Dir */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Nút Chọn thư mục này ngay tại toolbar phía trên */}
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => handleApply(currentPath)}
                disabled={isLoading}
                className="h-7 px-3 text-[11px] font-semibold gap-1.5 bg-[#1DB954] hover:bg-[#1ed760] text-black shrink-0 cursor-pointer shadow-sm"
                title={`Chọn ngay thư mục này: ${currentPath}`}
              >
                <Check size={12} className="stroke-[2.5]" />
                <span>Chọn thư mục này</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsCreating(true);
                  setNewFolderName('');
                }}
                disabled={isCreating || isLoading}
                className="h-7 px-2.5 text-[11px] flex items-center gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 cursor-pointer"
                title="Tạo thư mục mới tại vị trí này"
              >
                <FolderPlus size={12} />
                <span>+ Tạo thư mục mới</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadDirectory(currentPath)}
                disabled={isLoading}
                className="h-7 w-7 p-0 flex items-center justify-center cursor-pointer"
                title="Làm mới danh sách thư mục"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleNativePick}
                disabled={isPickingNative}
                className="h-7 px-2 text-[10.5px] flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                title="Mở hộp thoại chọn thư mục Windows Explorer truyền thống"
              >
                <ExternalLink size={11} />
                <span>Explorer</span>
              </Button>
            </div>
          </div>

          {/* 3. Horizontal Layout Body */}
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
            {/* Left Sidebar: Quick Roots, Drives, History & Suggestions (ĐÃ XÓA HƯỚNG DẪN NHANH) */}
            <div className="w-full md:w-64 lg:w-72 border-b md:border-b-0 md:border-r border-[var(--border)] bg-[var(--bg-subtle)]/30 p-4 flex flex-col shrink-0 space-y-4 overflow-y-auto min-h-0">
              {/* 1. Gợi ý từ Thư viện Nghệ sĩ */}
              {suggestedFolder && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1 px-1">
                    <Sparkles size={11} />
                    <span>Thư mục nghệ sĩ có sẵn</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => loadDirectory(suggestedFolder)}
                    className="w-full text-left p-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all text-[11px] group cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <FolderOpen size={14} className="text-emerald-400 shrink-0" />
                      <span className="truncate flex-1 font-semibold text-emerald-300 font-mono">
                        {suggestedFolder.split(/[\\/]/).filter(Boolean).slice(-1)[0]}
                      </span>
                      <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                        Đến
                      </span>
                    </div>
                    <div className="text-[9.5px] text-emerald-400/70 truncate mt-1 font-mono">
                      {suggestedFolder}
                    </div>
                  </button>
                </div>
              )}

              {/* 2. Vị trí chính (Quick Roots) */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block px-1">
                  Vị trí thư viện chính
                </span>
                {quickRoots.map((qr) => (
                  <button
                    key={qr.path}
                    type="button"
                    onClick={() => loadDirectory(qr.path)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-[11px] flex items-center gap-2 transition-colors cursor-pointer ${
                      currentPath.toLowerCase() === qr.path.toLowerCase()
                        ? 'border-[#1DB954]/40 bg-[#1DB954]/10 text-[#1DB954] font-semibold'
                        : 'border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    title={qr.path}
                  >
                    <Folder size={13} className="text-[#1DB954] shrink-0" />
                    <span className="truncate flex-1">{qr.name}</span>
                  </button>
                ))}
              </div>

              {/* 3. Ổ đĩa (Drives) */}
              {availableDrives.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block px-1">
                    Ổ đĩa máy tính
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {availableDrives.map((drive) => (
                      <button
                        key={drive}
                        type="button"
                        onClick={() => loadDirectory(drive)}
                        className={`text-left px-2.5 py-1.5 rounded-lg border text-[11px] flex items-center gap-2 transition-colors cursor-pointer ${
                          currentPath.toLowerCase().startsWith(drive.toLowerCase())
                            ? 'border-[#1DB954]/40 bg-[#1DB954]/10 text-[#1DB954] font-semibold'
                            : 'border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <HardDrive size={13} className="shrink-0 opacity-70" />
                        <span className="font-mono font-bold">{drive}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Thư mục đã dùng gần đây (History) */}
              {folderHistory.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block px-1 flex items-center gap-1">
                    <History size={10} />
                    <span>Thư mục gần đây</span>
                  </span>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {folderHistory.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => loadDirectory(h)}
                        className="w-full text-left p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[10.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-colors cursor-pointer"
                        title={h}
                      >
                        <Folder size={11} className="shrink-0 text-amber-400" />
                        <span className="truncate flex-1 font-mono">
                          {h.split(/[\\/]/).filter(Boolean).slice(-1)[0]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Main Content: Subdirectories grid & Actions */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[var(--bg-surface)]">
              {/* Header con hiển thị thông tin thư mục hiện tại */}
              <div className="shrink-0 px-5 py-2.5 border-b border-[var(--border)] bg-[var(--bg-subtle)]/40 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[var(--text-muted)] text-[11px] font-medium">Danh mục thư mục con ({directories.length})</span>
                  <span className="text-[var(--text-muted)] text-[10px] hidden sm:inline">• Nhấp để chọn • Nhấp đúp để mở</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-muted)]">Đang ở:</span>
                  <span className="font-mono text-[11px] font-bold text-[#1DB954] truncate max-w-[260px]" title={currentPath}>
                    {currentPath.split(/[\\/]/).filter(Boolean).slice(-1)[0] || currentPath}
                  </span>
                </div>
              </div>

              {/* Action Toolbar nổi bật khi có 1 thư mục con đang được chọn */}
              {selectedSubItem && (
                <div className="shrink-0 px-5 py-2.5 bg-[#1DB954]/5 border-b border-[#1DB954]/20 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 text-xs">
                    <Folder size={14} className="text-[#1DB954] shrink-0" />
                    <span className="text-[var(--text-muted)] text-[11px]">Đang chọn:</span>
                    <strong className="text-[var(--text-primary)] font-semibold truncate max-w-[220px]">
                      {selectedSubItem.name}
                    </strong>
                    <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                      {selectedSubItem.subCount} thư mục con
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => loadDirectory(selectedSubItem.path)}
                      className="h-7 px-2.5 text-[11px] gap-1 cursor-pointer"
                      title="Mở thư mục này để xem bên trong"
                    >
                      <FolderOpen size={12} className="text-[#1DB954]" />
                      <span>Mở</span>
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditingPath(selectedSubItem.path);
                        setRenameValue(selectedSubItem.name);
                      }}
                      className="h-7 px-2.5 text-[11px] gap-1 text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                      title="Đổi tên thư mục này"
                    >
                      <Edit2 size={12} />
                      <span>Đổi tên</span>
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setDeletingItem({ path: selectedSubItem.path, name: selectedSubItem.name })}
                      className="h-7 px-2.5 text-[11px] gap-1 text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      title="Xóa thư mục này"
                    >
                      <Trash2 size={12} />
                      <span>Xóa</span>
                    </Button>

                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => handleApply(selectedSubItem.path)}
                      className="h-7 px-3 text-[11px] font-semibold gap-1 bg-[#1DB954] hover:bg-[#1ed760] text-black shadow-sm cursor-pointer"
                      title={`Lưu bài hát vào thư mục: ${selectedSubItem.path}`}
                    >
                      <Check size={12} className="stroke-[2.5]" />
                      <span>Chọn lưu vào đây</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* Vùng cuộn danh sách thư mục con */}
              <div className="flex-1 min-h-0 overflow-y-auto p-5">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center h-52 text-[var(--text-muted)] space-y-2">
                    <Loader2 size={24} className="animate-spin text-[#1DB954]" />
                    <span className="text-xs">Đang đọc danh sách thư mục...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Form tạo thư mục mới nếu đang bật */}
                    {isCreating && (
                      <form
                        onSubmit={handleCreateFolder}
                        className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/5 flex items-center gap-2"
                      >
                        <FolderPlus size={16} className="text-emerald-400 shrink-0" />
                        <input
                          type="text"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          placeholder="Nhập tên thư mục mới..."
                          autoFocus
                          className="flex-1 h-8 px-3 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-emerald-500"
                        />
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          disabled={isCreatingSubmitting}
                          className="h-8 px-3 text-xs font-semibold gap-1.5 bg-emerald-500 text-black hover:bg-emerald-400 cursor-pointer"
                        >
                          {isCreatingSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          <span>Tạo</span>
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setIsCreating(false);
                            setNewFolderName('');
                          }}
                          className="h-8 px-2.5 text-xs cursor-pointer"
                        >
                          <X size={12} />
                        </Button>
                      </form>
                    )}

                    {/* Banner form Đổi tên thư mục chuyên dụng (thoải mái, không bị bóp méo thẻ card) */}
                    {editingItem && (
                      <div className="p-3.5 rounded-xl border-2 border-amber-500/60 bg-amber-500/10 space-y-2.5 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between text-xs text-amber-400 font-semibold">
                          <span className="flex items-center gap-1.5">
                            <Edit2 size={13} />
                            <span>Đổi tên thư mục: <strong className="text-[var(--text-primary)] font-mono">{editingItem.name}</strong></span>
                          </span>
                          <span className="text-[10.5px] text-[var(--text-muted)] font-normal">Nhấn Enter để lưu • Esc để hủy</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRenameFolder(editingItem.path);
                              } else if (e.key === 'Escape') {
                                setEditingPath(null);
                              }
                            }}
                            autoFocus
                            placeholder="Nhập tên mới..."
                            className="flex-1 h-8 px-3 rounded-lg text-xs bg-[var(--bg-surface)] border border-amber-500/50 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                          />
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => handleRenameFolder(editingItem.path)}
                            disabled={isRenamingSubmitting}
                            className="h-8 px-3.5 text-xs font-semibold gap-1 bg-amber-500 text-black hover:bg-amber-400 cursor-pointer"
                          >
                            {isRenamingSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            <span>Lưu tên mới</span>
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingPath(null)}
                            className="h-8 px-2.5 text-xs cursor-pointer"
                          >
                            <X size={12} />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Khi thư mục rỗng */}
                    {directories.length === 0 && !isCreating ? (
                      <div className="flex flex-col items-center justify-center text-center py-12 border-2 border-dashed border-[var(--border)] rounded-2xl bg-[var(--bg-subtle)]/20 p-6 space-y-4 my-auto">
                        <div className="w-14 h-14 rounded-2xl bg-[#1DB954]/10 text-[#1DB954] flex items-center justify-center">
                          <Folder size={28} />
                        </div>
                        <div className="max-w-md">
                          <div className="text-sm font-bold text-[var(--text-primary)]">
                            Thư mục này chưa có thư mục con nào
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
                            Bạn có thể bấm nút màu xanh bên dưới để chọn trực tiếp thư mục{' '}
                            <span className="font-mono text-emerald-400 font-semibold px-1 py-0.5 rounded bg-emerald-500/10">
                              {currentPath.split(/[\\/]/).filter(Boolean).slice(-1)[0] || currentPath}
                            </span>{' '}
                            làm nơi lưu bài nhạc, hoặc tạo thêm thư mục con mới.
                          </p>
                        </div>

                        <div className="flex items-center gap-2.5 flex-wrap justify-center pt-2">
                          <Button
                            type="button"
                            variant="primary"
                            size="md"
                            onClick={() => handleApply(currentPath)}
                            className="gap-2 text-xs font-bold px-5 py-2.5 bg-[#1DB954] hover:bg-[#1ed760] text-black shadow-md cursor-pointer"
                          >
                            <Check size={16} className="stroke-[2.5]" />
                            <span>✓ Lưu vào thư mục hiện tại này</span>
                          </Button>

                          <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            onClick={() => setIsCreating(true)}
                            className="gap-1.5 text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 cursor-pointer px-4 py-2.5"
                          >
                            <FolderPlus size={15} />
                            <span>+ Tạo thư mục con tại đây</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Grid Layout thoáng đạt các thư mục */
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                        {directories.map((dir) => {
                          const isSelected = selectedPath.toLowerCase() === dir.path.toLowerCase();

                          return (
                            <div
                              key={dir.path}
                              onClick={() => setSelectedPath(dir.path)}
                              onDoubleClick={() => loadDirectory(dir.path)}
                              className={`group p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                                isSelected
                                  ? 'border-[#1DB954] bg-[#1DB954]/10 text-[var(--text-primary)] ring-2 ring-[#1DB954]/25 shadow-md'
                                  : 'border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] hover:border-[var(--text-muted)] text-[var(--text-secondary)]'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <Folder
                                  size={20}
                                  className={`shrink-0 transition-colors ${
                                    isSelected ? 'text-[#1DB954]' : 'text-amber-400 group-hover:text-amber-300'
                                  }`}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-[12.5px] font-semibold text-[var(--text-primary)] truncate" title={dir.name}>
                                    {dir.name}
                                  </div>
                                  <div className="text-[10.5px] text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
                                    <span>{dir.subCount} thư mục con</span>
                                  </div>
                                </div>
                              </div>

                              {/* Action Buttons: Đổi tên, Xóa, Mở */}
                              <div
                                className={`flex items-center gap-1 shrink-0 transition-opacity ${
                                  isSelected ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPath(dir.path);
                                    setEditingPath(dir.path);
                                    setRenameValue(dir.name);
                                  }}
                                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-amber-400 hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                                  title="Đổi tên thư mục này"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPath(dir.path);
                                    setDeletingItem({ path: dir.path, name: dir.name });
                                  }}
                                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  title="Xóa thư mục này"
                                >
                                  <Trash2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    loadDirectory(dir.path);
                                  }}
                                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[#1DB954] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                                  title="Mở thư mục này"
                                >
                                  <FolderOpen size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Footer Bar - Luôn Cố Định Chân Modal */}
          <div className="shrink-0 sticky bottom-0 z-20 flex items-center justify-between px-6 py-3.5 border-t border-[var(--border)] bg-[var(--bg-subtle)] gap-3 flex-wrap shadow-lg">
            <div className="flex items-center gap-2 min-w-0 flex-1 text-xs">
              <span className="text-[var(--text-muted)] shrink-0 font-medium">Thư mục sẽ áp dụng:</span>
              <div
                className="font-mono text-[11px] text-[#1DB954] truncate bg-[var(--bg-surface)] px-2.5 py-1 rounded-lg border border-[var(--border)] flex-1 max-w-xl select-all font-semibold"
                title={selectedPath || currentPath}
              >
                {selectedPath || currentPath}
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleReset}
                className="gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                title="Khôi phục mặc định lưu theo nghệ sĩ (tự tạo folder nghệ sĩ/album)"
              >
                <RotateCcw size={12} />
                <span>Mặc định theo nghệ sĩ</span>
              </Button>

              <Button type="button" variant="secondary" size="sm" onClick={onClose} className="text-xs px-4 cursor-pointer">
                Hủy
              </Button>

              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => handleApply()}
                disabled={isLoading}
                className="gap-2 text-xs font-semibold px-5 bg-[#1DB954] hover:bg-[#1ed760] text-black shadow-md cursor-pointer"
              >
                <Check size={14} className="stroke-[2.5]" />
                <span>Chọn thư mục này</span>
              </Button>
            </div>
          </div>

          {/* Modal Popup Xác nhận Xóa Thư Mục An Toàn */}
          {deletingItem && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 select-none">
              <div className="w-full max-w-md bg-[var(--bg-surface)] border border-rose-500/30 rounded-2xl shadow-2xl p-5 space-y-4">
                <div className="flex items-center gap-3 text-rose-400">
                  <div className="p-2.5 rounded-xl bg-rose-500/10">
                    <AlertTriangle size={22} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)] m-0">Xác nhận xóa thư mục</h4>
                    <p className="text-[11px] text-[var(--text-muted)] m-0 mt-0.5">Hành động này sẽ xóa khỏi ổ đĩa máy tính</p>
                  </div>
                </div>

                <p className="text-xs text-[var(--text-secondary)] leading-relaxed m-0">
                  Bạn có chắc chắn muốn xóa thư mục <strong className="text-rose-400 font-mono">"{deletingItem.name}"</strong> và toàn bộ nội dung bên trong?
                </p>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setDeletingItem(null)}
                    disabled={isDeletingSubmitting}
                    className="cursor-pointer"
                  >
                    Hủy bỏ
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleDeleteFolder}
                    disabled={isDeletingSubmitting}
                    className="gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
                  >
                    {isDeletingSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    <span>Xác nhận xóa</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
