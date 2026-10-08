import { execFile } from 'child_process';
import util from 'util';
import path from 'path';

const execFileAsync = util.promisify(execFile);

/**
 * Mở hộp thoại chọn thư mục gốc của hệ điều hành Windows bằng PowerShell
 * @param initialPath Đường dẫn thư mục gợi ý ban đầu
 * @returns Đường dẫn thư mục người dùng đã chọn (chuẩn hóa dấu /), hoặc null nếu hủy
 */
export async function pickFolderNative(initialPath?: string): Promise<string | null> {
  const scriptPath = path.join(
    process.cwd().endsWith('indexer') ? process.cwd() : path.join(process.cwd(), 'tools/indexer'),
    'scripts',
    'pickFolder.ps1'
  );

  try {
    const args = [
      '-NoProfile',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
    ];
    if (initialPath) {
      args.push('-InitialPath', initialPath.replace(/\//g, '\\'));
    }

    const { stdout } = await execFileAsync('powershell.exe', args, {
      windowsHide: false,
      timeout: 120000, // Cho người dùng tối đa 2 phút để chọn
    });

    const selected = stdout.trim();
    return selected ? selected.replace(/\\/g, '/') : null;
  } catch (err) {
    console.warn('Lỗi khi mở FolderPicker native:', err);
    return null;
  }
}
