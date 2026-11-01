import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface ImageMetadataOptions {
  artistName: string;
  curator?: string; // Mặc định 'Kato'
  albumName?: string;
}

/**
 * Ghi thông tin metadata chuyên nghiệp vào tab "Details" của file ảnh (Windows Explorer Details tab & EXIF/XMP).
 * Đánh dấu quyền quản lý/biên tập thuộc về "Kato" kèm thông tin bản quyền và nghệ sĩ chỉn chu.
 */
export function applyArtistImageMetadata(filePath: string, options: ImageMetadataOptions): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const curator = options.curator || 'Kato';
  const artistName = options.artistName || 'Unknown Artist';

  // 1. Nếu đang chạy trên Windows, dùng PowerShell WIC (Windows Imaging Component)
  // để ghi trực tiếp các trường System.Author, System.Title, System.Comment, System.Keywords của Windows Shell
  if (process.platform === 'win32') {
    try {
      const psScript = path.resolve(import.meta.dirname, 'applyImageMetadata.ps1');
      if (fs.existsSync(psScript)) {
        execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            psScript,
            '-FilePath',
            path.resolve(filePath),
            '-ArtistName',
            artistName,
            '-Curator',
            curator,
          ],
          { encoding: 'utf-8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }
        );
        return true;
      }
    } catch {
      // Fallback sang ffmpeg nếu WIC gặp trở ngại
    }
  }

  // 2. Fallback đa nền tảng: ffmpeg metadata injection
  try {
    const ext = path.extname(filePath).toLowerCase();
    const tempFile = filePath + `.ffmeta_tmp${ext}`;
    const title = `Official Artist Artwork - ${artistName}`;
    const comment = `Curated, verified, and enhanced by ${curator} for Beatify Music Library. Premium lossless profile artwork.`;
    const copyright = `Curated by ${curator} © Beatify Music Ecosystem. All rights reserved.`;

    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        filePath,
        '-metadata',
        `title=${title}`,
        '-metadata',
        `author=${curator}`,
        '-metadata',
        `artist=${curator}`,
        '-metadata',
        `copyright=${copyright}`,
        '-metadata',
        `comment=${comment}`,
        '-loglevel',
        'quiet',
        tempFile,
      ],
      { timeout: 10000 }
    );

    if (fs.existsSync(tempFile)) {
      fs.renameSync(tempFile, filePath);
      return true;
    }
  } catch {
    // Bỏ qua lỗi fallback
  }

  return false;
}
