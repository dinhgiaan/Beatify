import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface DependencyStatus {
  ytdlp: {
    installed: boolean;
    version: string | null;
    path: string | null;
    canUpdate: boolean;
  };
  ffmpeg: {
    installed: boolean;
    version: string | null;
    path: string | null;
  };
  runtime: {
    type: 'deno' | 'node' | 'none';
    version: string | null;
    path?: string | null;
  };
  ready: boolean;
  needsShellRestart: boolean;
  errors: string[];
}

let cachedStatus: DependencyStatus | null = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 30000; // Cache 30 giây

export const DependencyChecker = {
  /**
   * Tải lại các biến môi trường PATH từ Windows Registry (User + Machine)
   * Đồng thời tự động phát hiện các gói cài qua WinGet / LocalAppData
   */
  refreshSystemPath(): boolean {
    if (process.platform !== 'win32') return false;

    try {
      const systemRoot = process.env.SystemRoot || 'C:\\Windows';
      const psExe = fs.existsSync(path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'))
        ? `"${path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')}"`
        : 'powershell';

      let rawMachinePath = '';
      let rawUserPath = '';

      try {
        rawMachinePath = execSync(
          `${psExe} -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('Path','Machine')"`,
          { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }
        ).trim();
      } catch {
        // Fallback im lặng nếu powershell gặp lỗi
      }

      try {
        rawUserPath = execSync(
          `${psExe} -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('Path','User')"`,
          { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }
        ).trim();
      } catch {
        // Fallback im lặng
      }

      // Bổ sung các đường dẫn WinGet Packages phổ biến
      const localAppData = process.env.LOCALAPPDATA || '';
      const extraPaths: string[] = [
        path.join(systemRoot, 'System32'),
        path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0'),
      ];

      if (localAppData) {
        extraPaths.push(path.join(localAppData, 'Microsoft', 'WinGet', 'Links'));
        extraPaths.push(path.join(localAppData, 'Programs'));

        // Tìm thư mục binary trực tiếp trong WinGet Packages nếu có
        const wingetPackagesDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
        if (fs.existsSync(wingetPackagesDir)) {
          try {
            const entries = fs.readdirSync(wingetPackagesDir);
            for (const entry of entries) {
              const fullEntry = path.join(wingetPackagesDir, entry);
              if (fs.statSync(fullEntry).isDirectory()) {
                extraPaths.push(fullEntry);
                const binDir = path.join(fullEntry, 'bin');
                if (fs.existsSync(binDir)) extraPaths.push(binDir);
                try {
                  const subEntries = fs.readdirSync(fullEntry);
                  for (const sub of subEntries) {
                    const subFull = path.join(fullEntry, sub, 'bin');
                    if (fs.existsSync(subFull)) extraPaths.push(subFull);
                  }
                } catch {
                  // Bỏ qua lỗi truy cập thư mục con
                }
              }
            }
          } catch {
            // Bỏ qua nếu không đọc được thư mục WinGet Packages
          }
        }
      }

      const existingPaths = (process.env.PATH || '').split(';').filter(Boolean);
      const allPaths = Array.from(new Set([
        ...extraPaths,
        ...rawMachinePath.split(';').filter(Boolean),
        ...rawUserPath.split(';').filter(Boolean),
        ...existingPaths,
      ]));

      const combined = allPaths.join(';');
      const originalLength = (process.env.PATH || '').length;
      process.env.PATH = combined;
      return combined.length > originalLength;
    } catch {
      return false;
    }
  },

  /**
   * Kiểm tra xem yt-dlp và ffmpeg đã được cài đặt và sẵn sàng hoạt động hay chưa
   */
  checkDependencies(force = false): DependencyStatus {
    const now = Date.now();
    if (!force && cachedStatus && cachedStatus.ready && now - lastCheckTime < CACHE_TTL_MS) {
      return cachedStatus;
    }

    this.refreshSystemPath();

    let ytdlpInstalled: boolean;
    let ytdlpVersion: string | null = null;
    let ytdlpPath: string | null = null;

    let ffmpegInstalled: boolean;
    let ffmpegVersion: string | null = null;
    let ffmpegPath: string | null = null;

    // 1. Kiểm tra yt-dlp (chặn toàn bộ stderr console leak với stdio: 'pipe')
    try {
      const out = execSync('yt-dlp --version', { encoding: 'utf-8', timeout: 15000, stdio: 'pipe' }).trim();
      ytdlpInstalled = true;
      ytdlpVersion = out;
      try {
        const whereOut = execSync('where yt-dlp', { encoding: 'utf-8', timeout: 4000, stdio: 'pipe' });
        ytdlpPath = whereOut.split('\n')[0]?.trim() || null;
      } catch {
        ytdlpPath = null;
      }
    } catch {
      ytdlpInstalled = false;
    }

    // 2. Kiểm tra ffmpeg (chặn toàn bộ stderr console leak với stdio: 'pipe')
    try {
      const out = execSync('ffmpeg -version', { encoding: 'utf-8', timeout: 8000, stdio: 'pipe' });
      ffmpegInstalled = true;
      ffmpegVersion = out.split('\n')[0]?.trim() || null;
      try {
        const whereOut = execSync('where ffmpeg', { encoding: 'utf-8', timeout: 4000, stdio: 'pipe' });
        ffmpegPath = whereOut.split('\n')[0]?.trim() || null;
      } catch {
        ffmpegPath = null;
      }
    } catch {
      ffmpegInstalled = false;
    }

    const result: DependencyStatus = {
      ytdlp: {
        installed: ytdlpInstalled,
        version: ytdlpVersion,
        path: ytdlpPath,
        canUpdate: ytdlpInstalled,
      },
      ffmpeg: {
        installed: ffmpegInstalled,
        version: ffmpegVersion,
        path: ffmpegPath,
      },
      runtime: {
        type: 'node' as const,
        version: process.version,
        path: process.execPath,
      },
      ready: ytdlpInstalled && ffmpegInstalled,
      needsShellRestart: false,
      errors: [],
    };

    cachedStatus = result;
    lastCheckTime = now;
    return result;
  },

  /**
   * Cập nhật yt-dlp lên bản mới nhất
   */
  async updateYtDlp(): Promise<{ success: boolean; output: string }> {
    this.refreshSystemPath();
    cachedStatus = null; // Clear cache
    try {
      const out = execSync('yt-dlp -U', { encoding: 'utf-8', timeout: 30000 });
      this.checkDependencies(true);
      return { success: true, output: out.trim() };
    } catch {
      try {
        const out = execSync('winget upgrade yt-dlp --silent --accept-source-agreements', {
          encoding: 'utf-8',
          timeout: 45000,
        });
        this.checkDependencies(true);
        return { success: true, output: out.trim() };
      } catch (err2: unknown) {
        const msg = err2 instanceof Error ? err2.message : String(err2);
        return { success: false, output: msg || 'Không thể cập nhật yt-dlp' };
      }
    }
  },
};
