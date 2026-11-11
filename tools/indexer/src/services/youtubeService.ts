import { spawn, execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import crypto from 'crypto';
import { DependencyChecker } from './dependencyChecker';
import { MetadataCleaner, type CleanedMetadata } from './metadataCleaner';
import { PathSanitizer } from './pathSanitizer';
import { LyricsService, type LyricsResult } from './lyricsService';
import { calculateTrackId } from './scanner';
import { setTrackOverride, restoreFromTrash } from './overridesManager';
import { normalizeText } from '@music-app/shared';
import { applyArtistImageMetadata } from './imageMetadataService';

export interface YoutubePreviewEntry {
  id: string;
  url: string;
  originalTitle: string;
  cleaned: CleanedMetadata;
  year?: number;
  duration?: number;
  thumbnailUrl?: string;
  channelUrl?: string;
  lyrics?: LyricsResult;
}

export interface YoutubePreviewResult {
  isPlaylist: boolean;
  playlistTitle?: string;
  entries: YoutubePreviewEntry[];
}

export interface YoutubeDownloadOptions {
  url: string;
  targetDir: string;
  coversDir: string;
  lyricsDir: string;
  format?: 'm4a' | 'mp3' | 'flac';
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  duration?: number;
  lyricsText?: string;
  thumbnailUrl?: string;
  channelUrl?: string;
  onProgress?: (percent: number, stage: string) => void;
}

export interface YoutubeDownloadResult {
  trackId: string;
  filePath: string;
  albumId: string;
  title: string;
  artist: string;
  album: string;
  year?: number;
  duration: number;
  hasCover: boolean;
  hasLyrics: boolean;
  loudnessLufs?: number;
  replayGain?: number;
  artistAvatarStatus?: string;
}

function runCommand(
  command: string,
  args: string[],
  signal?: AbortSignal
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    DependencyChecker.refreshSystemPath();
    const child = spawn(command, args, { signal, env: process.env });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

async function fetchUrlText(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUrlBuffer(url: string, timeoutMs = 10000): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Phân giải cấu trúc thư mục lưu trữ Thư viện Âm nhạc:
 * <Target Root> / <Tên Nghệ Sĩ> / <Tên Bài Nhạc hoặc Tên Album>
 */
export function resolveDestinationPaths(
  baseTargetDir: string,
  artist: string,
  album: string,
  title: string
): { artistDir: string; finalTrackDir: string; isSingle: boolean } {
  const normBase = path.resolve(baseTargetDir);
  const safeArtist = PathSanitizer.sanitizeSegment(artist || 'Unknown Artist');
  const safeTitle = PathSanitizer.sanitizeSegment(title || 'Unknown Track');

  const isSingle =
    !album ||
    album.trim().toLowerCase() === 'singles' ||
    album.trim().toLowerCase() === 'single' ||
    album.trim().toLowerCase() === title.trim().toLowerCase();

  const safeAlbum = PathSanitizer.sanitizeSegment(album || 'Singles');
  const baseName = path.basename(normBase);

  let artistDir: string;
  let finalTrackDir: string;

  // Trường hợp 1: baseTargetDir đã là chính thư mục của bài hát này
  // (ví dụ: .../morray/Singles/quicksand)
  if (baseName.toLowerCase() === safeTitle.toLowerCase()) {
    artistDir = resolveArtistDirectory(normBase, artist);
    finalTrackDir = normBase;
  }
  // Trường hợp 2: baseTargetDir kết thúc bằng "Singles" hoặc "Single"
  // (ví dụ: .../morray/Singles -> .../morray/Singles/<safeTitle>)
  else if (/^(singles|single)$/i.test(baseName)) {
    artistDir = resolveArtistDirectory(normBase, artist);
    finalTrackDir = path.join(normBase, safeTitle);
  }
  // Trường hợp 3: baseTargetDir là thư mục Album cụ thể (ví dụ: .../morray/Street Sermons)
  else if (!isSingle && baseName.toLowerCase() === safeAlbum.toLowerCase()) {
    artistDir = resolveArtistDirectory(normBase, artist);
    finalTrackDir = normBase;
  }
  // Trường hợp 4: baseTargetDir là thư mục của chính nghệ sĩ (ví dụ: .../morray)
  else if (baseName.toLowerCase() === safeArtist.toLowerCase()) {
    artistDir = normBase;
    if (isSingle) {
      finalTrackDir = path.join(artistDir, 'Singles', safeTitle);
    } else {
      finalTrackDir = path.join(artistDir, safeAlbum);
    }
  }
  // Trường hợp 5: baseTargetDir là thư mục gốc chung (ví dụ: D:\music_source\_imported hoặc D:\Music\(Rap))
  else {
    artistDir = path.join(normBase, safeArtist);
    if (isSingle) {
      finalTrackDir = path.join(artistDir, 'Singles', safeTitle);
    } else {
      finalTrackDir = path.join(artistDir, safeAlbum);
    }
  }

  return { artistDir, finalTrackDir, isSingle };
}

/**
 * Xác định thư mục Nghệ sĩ (Artist Directory).
 * Ví dụ:
 * - "D:\music for app\(rap)\DAWGS F\Singles" -> "D:\music for app\(rap)\DAWGS F"
 * - "D:\music for app\(rap)\DAWGS F\Albums" -> "D:\music for app\(rap)\DAWGS F"
 * - "D:\music for app\(rap)\DAWGS F\Album XYZ" -> "D:\music for app\(rap)\DAWGS F"
 * - "D:\music for app\(rap)\DAWGS F" -> "D:\music for app\(rap)\DAWGS F"
 */
export function resolveArtistDirectory(targetDir: string, artistName?: string): string {
  const normalizedTarget = path.resolve(targetDir);
  const baseName = path.basename(normalizedTarget);
  const parentDir = path.dirname(normalizedTarget);
  const parentBase = path.basename(parentDir);

  // Không bao giờ lùi lên ổ đĩa gốc (e.g. "D:\" hoặc "/")
  const isParentRoot = parentDir === path.parse(parentDir).root;

  // 1. Thư mục dạng Singles / Albums / Single / EP
  const subfolderPatterns = /^(singles|albums|single|ep|eps|album)$/i;
  if (subfolderPatterns.test(baseName) && !isParentRoot) {
    return parentDir;
  }

  // 2. Thư mục cha trùng hoặc chứa tên nghệ sĩ (ví dụ targetDir là tên 1 Album cụ thể)
  if (artistName && parentBase && !isParentRoot) {
    const normArtist = normalizeText(artistName).toLowerCase();
    const normParent = normalizeText(parentBase).toLowerCase();
    if (normParent === normArtist || normParent.includes(normArtist) || normArtist.includes(normParent)) {
      return parentDir;
    }
  }

  return normalizedTarget;
}

/**
 * Kiểm tra xem thư mục nghệ sĩ đã có ảnh nghệ sĩ (artist.jpg, folder.jpg, cover.jpg...) chưa
 */
export function hasArtistImage(artistDir: string): boolean {
  return Boolean(getArtistImagePath(artistDir));
}

/**
 * Trả về đường dẫn tệp ảnh đại diện nghệ sĩ nếu có
 */
export function getArtistImagePath(artistDir: string): string | null {
  if (!fs.existsSync(artistDir)) return null;

  const candidateNames = [
    'artist.png',
    'artist.webp',
    'artist.jpg',
    'artist.jpeg',
    'folder.png',
    'folder.jpg',
    'cover.jpg',
  ];

  for (const name of candidateNames) {
    const fullPath = path.join(artistDir, name);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  try {
    const files = fs.readdirSync(artistDir);
    const found = files.find((f) => /^artist\.(jpg|jpeg|png|webp)$/i.test(f));
    if (found) {
      return path.join(artistDir, found);
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Tải avatar độ phân giải cao của channel YouTube nghệ sĩ
 */
export async function fetchChannelAvatarBuffer(videoUrl: string, channelUrl?: string): Promise<Buffer | null> {
  try {
    let avatarUrl: string | null = null;

    // 1. Thử lấy từ channelUrl nếu có
    if (channelUrl) {
      const channelHtml = await fetchUrlText(channelUrl);
      const ogMatch = channelHtml.match(/<meta property="og:image" content="([^"]+)"/i);
      if (ogMatch && ogMatch[1]) {
        avatarUrl = ogMatch[1];
      }
    }

    // 2. Nếu chưa có, phân tích từ video page
    if (!avatarUrl && videoUrl) {
      const videoHtml = await fetchUrlText(videoUrl);
      const ownerMatch = videoHtml.match(/"videoOwnerRenderer":\{"thumbnail":\{"thumbnails":\[\{"url":"([^"]+)"/i);
      if (ownerMatch && ownerMatch[1]) {
        avatarUrl = ownerMatch[1];
      } else {
        const anyAvatar = videoHtml.match(/https:\/\/(?:yt3\.googleusercontent\.com|yt3\.ggpht\.com)\/[a-zA-Z0-9_-]+/);
        if (anyAvatar && anyAvatar[0]) {
          avatarUrl = anyAvatar[0];
        }
      }
    }

    if (!avatarUrl) return null;

    // Nâng cấp avatar lên chất lượng cao nhất (=s900-c-k-c0x00ffffff-no-rj)
    if (avatarUrl.includes('=s')) {
      avatarUrl = avatarUrl.replace(/=s\d+[^"]*/, '=s900-c-k-c0x00ffffff-no-rj');
    } else if (!avatarUrl.includes('=s900')) {
      avatarUrl = `${avatarUrl}=s900-c-k-c0x00ffffff-no-rj`;
    }

    return await fetchUrlBuffer(avatarUrl);
  } catch {
    return null;
  }
}

export const YoutubeService = {
  /**
   * Kiểm tra tính hợp lệ của URL YouTube / YouTube Music
   */
  isValidYoutubeUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url.trim());
      const validHosts = [
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'music.youtube.com',
        'youtu.be',
      ];
      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        validHosts.includes(parsed.hostname.toLowerCase())
      );
    } catch {
      return false;
    }
  },

  /**
   * Bóc tách video ID từ URL
   */
  extractVideoId(url: string): string | null {
    if (!url || typeof url !== 'string') return null;
    try {
      const parsed = new URL(url.trim());
      if (parsed.hostname.toLowerCase().includes('youtu.be')) {
        return parsed.pathname.replace(/^\//, '') || null;
      }
      return parsed.searchParams.get('v') || null;
    } catch {
      return null;
    }
  },

  /**
   * Xem trước thông tin bài hát / playlist từ link YouTube mà chưa tải
   */
  async previewUrl(url: string): Promise<YoutubePreviewResult> {
    const cleanUrl = url.trim();
    if (!this.isValidYoutubeUrl(cleanUrl)) {
      throw new Error('URL YouTube không hợp lệ. Vui lòng nhập link youtube.com hoặc youtu.be');
    }

    // Chạy yt-dlp để lấy metadata JSON (không tải media)
    const { stdout, exitCode, stderr } = await runCommand('yt-dlp', [
      '--dump-single-json',
      '--no-warnings',
      '--flat-playlist',
      cleanUrl,
    ]);

    if (exitCode !== 0) {
      throw new Error(`Không thể lấy thông tin từ YouTube: ${stderr || 'Lỗi không xác định'}`);
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(stdout);
    } catch {
      throw new Error('Không phân tích được phản hồi dữ liệu từ yt-dlp');
    }

    const isPlaylist = Array.isArray(data.entries);
    const rawEntries = isPlaylist
      ? (data.entries as Record<string, unknown>[])
      : [data];

    const entries: YoutubePreviewEntry[] = [];

    for (const item of rawEntries.slice(0, 50)) {
      // Giới hạn xem trước tối đa 50 bài cho 1 playlist
      const id = String(item.id || '');
      const originalTitle = String(item.title || 'Unknown Title');
      const itemUrl = item.webpage_url ? String(item.webpage_url) : `https://www.youtube.com/watch?v=${id}`;
      const duration = typeof item.duration === 'number' ? item.duration : undefined;

      const thumbnails = Array.isArray(item.thumbnails) ? (item.thumbnails as { url?: string }[]) : [];
      const thumbnailUrl =
        typeof item.thumbnail === 'string'
          ? item.thumbnail
          : thumbnails[thumbnails.length - 1]?.url;

      const cleaned = MetadataCleaner.clean({
        title: originalTitle,
        uploader: typeof item.uploader === 'string' ? item.uploader : undefined,
        channel: typeof item.channel === 'string' ? item.channel : undefined,
        artist: typeof item.artist === 'string' ? item.artist : undefined,
        track: typeof item.track === 'string' ? item.track : undefined,
        album: typeof item.album === 'string' ? item.album : undefined,
      });

      // Tự động tìm kiếm lời bài hát: Ưu tiên 1 LRCLIB, Ưu tiên 2 Phụ đề chính thức YouTube CC
      let lyrics: LyricsResult | undefined;
      if (!isPlaylist || entries.length < 3) {
        try {
          lyrics = await LyricsService.fetchLyrics(cleaned.title, cleaned.artist, duration);
          if (!lyrics || lyrics.source === 'none' || lyrics.source === 'lrclib-plain') {
            const ytSub = await LyricsService.extractYouTubeSubtitles(itemUrl);
            if (ytSub?.syncedLyrics) {
              lyrics = {
                source: 'yt-subs',
                syncedLyrics: ytSub.syncedLyrics,
                plainLyrics: ytSub.plainLyrics,
                durationMismatchWarning: false,
              };
            }
          }
        } catch {
          // bỏ qua lỗi tìm lời
        }
      }

      // Trích xuất năm phát hành (Year) từ metadata video YouTube
      let releaseYear: number | undefined;
      if (typeof item.release_year === 'number') {
        releaseYear = item.release_year;
      } else if (typeof item.release_date === 'string' && item.release_date.length >= 4) {
        const y = parseInt(item.release_date.slice(0, 4), 10);
        if (!isNaN(y)) releaseYear = y;
      } else if (typeof item.upload_date === 'string' && item.upload_date.length >= 4) {
        const y = parseInt(item.upload_date.slice(0, 4), 10);
        if (!isNaN(y)) releaseYear = y;
      }

      const channelUrl =
        typeof item.channel_url === 'string'
          ? item.channel_url
          : typeof item.uploader_url === 'string'
            ? item.uploader_url
            : undefined;

      entries.push({
        id,
        url: itemUrl,
        originalTitle,
        cleaned,
        year: releaseYear,
        duration,
        thumbnailUrl,
        channelUrl,
        lyrics,
      });
    }

    return {
      isPlaylist,
      playlistTitle: isPlaylist ? String(data.title || 'Playlist YouTube') : undefined,
      entries,
    };
  },

  /**
   * Tải và đóng gói bài hát từ YouTube vào thư viện Beatify
   */
  async downloadAndProcess(
    options: YoutubeDownloadOptions
  ): Promise<YoutubeDownloadResult> {
    const {
      url,
      targetDir,
      coversDir,
      lyricsDir,
      format = 'm4a',
      title,
      artist,
      album,
      lyricsText,
      thumbnailUrl,
      onProgress,
    } = options;

    onProgress?.(5, 'Đang chuẩn bị môi trường tải...');

    const uniqueSuffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}_${process.pid}`;
    const tempDir = path.join(process.cwd(), `temp_youtube_${uniqueSuffix}`);
    await fsPromises.mkdir(tempDir, { recursive: true });

    try {
      // 1. Tải audio tốt nhất bằng yt-dlp
      onProgress?.(15, 'Đang tải âm thanh từ YouTube...');
      const tempAudioBase = path.join(tempDir, 'audio_raw');

      const ytdlpArgs = [
        '-x',
        '--audio-format',
        format,
        '--audio-quality',
        '0',
        '-o',
        `${tempAudioBase}.%(ext)s`,
        '--no-playlist',
        url,
      ];

      const dlResult = await runCommand('yt-dlp', ytdlpArgs);
      if (dlResult.exitCode !== 0) {
        throw new Error(`Lỗi tải âm thanh từ yt-dlp: ${dlResult.stderr}`);
      }

      // Tìm file âm thanh vừa tải xong
      const tempFiles = await fsPromises.readdir(tempDir);
      const audioFile = tempFiles.find((f) => f.startsWith('audio_raw.'));
      if (!audioFile) {
        throw new Error('Không tìm thấy tệp âm thanh sau khi tải');
      }
      const rawAudioPath = path.join(tempDir, audioFile);
      const audioExt = path.extname(rawAudioPath);

      // 2. Tải và xử lý ảnh bìa nếu có
      onProgress?.(50, 'Đang chuẩn bị ảnh bìa album...');
      let squareCoverBuffer: Buffer | undefined;

      if (thumbnailUrl) {
        try {
          const res = await fetch(thumbnailUrl);
          if (res.ok) {
            const rawThumbPath = path.join(tempDir, 'thumb_raw.jpg');
            const thumbArrayBuf = await res.arrayBuffer();
            await fsPromises.writeFile(rawThumbPath, Buffer.from(thumbArrayBuf));

            // Dùng ffmpeg để crop tâm vuông 1:1 và scale chuẩn 600x600 cho album cover
            const squareCoverPath = path.join(tempDir, 'cover_square.jpg');
            const cropResult = await runCommand('ffmpeg', [
              '-y',
              '-i',
              rawThumbPath,
              '-vf',
              "crop='min(iw,ih)':'min(iw,ih)',scale=600:600",
              '-q:v',
              '2',
              squareCoverPath,
            ]);

            if (cropResult.exitCode === 0 && fs.existsSync(squareCoverPath)) {
              squareCoverBuffer = await fsPromises.readFile(squareCoverPath);
            }
          }
        } catch {
          // Bỏ qua lỗi ảnh bìa nếu không tải được
        }
      }

      // 3. Đóng gói metadata và nhúng ảnh bìa bằng ffmpeg
      onProgress?.(70, 'Đang tối ưu và nhúng siêu dữ liệu...');
      const finalTitle = (title || 'Unknown Title').normalize('NFC').trim();
      const finalArtist = (artist || 'Unknown Artist').normalize('NFC').trim();
      const finalAlbum = (album || finalTitle).normalize('NFC').trim();
      const finalYear = options.year;

      const taggedAudioPath = path.join(tempDir, `final_tagged${audioExt}`);

      const ffmpegArgs = ['-y', '-i', rawAudioPath];

      // Nếu có ảnh bìa vuông thì nhúng vào audio stream
      if (squareCoverBuffer) {
        const coverTempPath = path.join(tempDir, 'cover_square.jpg');
        ffmpegArgs.push('-i', coverTempPath);
        ffmpegArgs.push('-map', '0:a', '-map', '1:v');
        ffmpegArgs.push('-c:a', 'copy');
        if (audioExt.toLowerCase() === '.mp3') {
          ffmpegArgs.push('-c:v', 'mjpeg', '-id3v2_version', '3', '-metadata:s:v', 'title="Album cover"', '-metadata:s:v', 'comment="Cover (front)"');
        } else if (audioExt.toLowerCase() === '.m4a') {
          ffmpegArgs.push('-c:v', 'copy', '-disposition:v:0', 'attached_pic');
        }
      } else {
        ffmpegArgs.push('-c', 'copy');
      }

      ffmpegArgs.push(
        '-metadata',
        `title=${finalTitle}`,
        '-metadata',
        `artist=${finalArtist}`,
        '-metadata',
        `album_artist=${finalArtist}`,
        '-metadata',
        `album=${finalAlbum}`,
        '-metadata',
        'comment=Kato',
        '-metadata',
        'encoded_by=Kato',
        '-metadata',
        'composer=Kato'
      );

      // Nhúng năm phát hành vào tab Details
      if (finalYear) {
        ffmpegArgs.push(
          '-metadata',
          `date=${finalYear}`,
          '-metadata',
          `year=${finalYear}`
        );
      }

      ffmpegArgs.push(taggedAudioPath);

      const ffmpegRes = await runCommand('ffmpeg', ffmpegArgs);
      const audioToMove = ffmpegRes.exitCode === 0 && fs.existsSync(taggedAudioPath)
        ? taggedAudioPath
        : rawAudioPath;

      // Phân giải cấu trúc thư mục chuẩn Thư viện Âm nhạc (Option 2): Nghệ sĩ / Album (hoặc Singles)
      const { artistDir, finalTrackDir } = resolveDestinationPaths(
        targetDir,
        finalArtist,
        finalAlbum,
        finalTitle
      );

      // 4. Di chuyển file vào thư mục đích
      onProgress?.(85, 'Đang lưu bài hát vào thư mục nhạc máy tính...');
      await fsPromises.mkdir(finalTrackDir, { recursive: true });
      const safeFileName = PathSanitizer.enforceMaxPathBudget(
        finalTrackDir,
        `${finalArtist} - ${finalTitle}`,
        audioExt
      );
      const finalDestPath = path.join(finalTrackDir, safeFileName);

      await PathSanitizer.safeMoveFile(audioToMove, finalDestPath);

      // 5. Tính trackId chuẩn của Beatify
      const trackId = await calculateTrackId(finalDestPath);
      const actualBaseName = path.basename(finalDestPath, audioExt);

      // 5.5. Đo độ lớn âm lượng (ReplayGain / LUFS) chuẩn theo EBU R128 bằng ffmpeg
      onProgress?.(92, 'Đang đo độ lớn âm lượng (ReplayGain / LUFS)...');
      const loudnessResult = await this.measureLoudness(finalDestPath);

      // Tính albumId
      const albumKey = `${normalizeText(finalArtist)}|${normalizeText(finalAlbum)}`;
      const albumId = crypto.createHash('sha1').update(albumKey).digest('hex').slice(0, 12);

      // 6. Lưu ảnh bìa chất lượng cao bên cạnh file nhạc và vào custom_covers
      let hasCover = false;
      if (squareCoverBuffer) {
        // 6.1. File ảnh bìa riêng cho bài hát tại thư mục đích
        const trackCoverDest = path.join(finalTrackDir, `${actualBaseName}.jpg`);
        if (!fs.existsSync(trackCoverDest)) {
          await fsPromises.writeFile(trackCoverDest, squareCoverBuffer);
        }

        // 6.2. Lưu vào custom_covers để sync R2
        if (coversDir) {
          await fsPromises.mkdir(coversDir, { recursive: true });
          const coverDestPath = path.join(coversDir, `${albumId}.jpg`);
          await fsPromises.writeFile(coverDestPath, squareCoverBuffer);
        }
        hasCover = true;
      }

      // 7. Lưu lời bài hát (.lrc) nếu có hoặc tự động fallback sang LRCLIB / YouTube CC
      let hasLyrics = false;
      let finalLyricsText = lyricsText?.trim() || '';

      if (!finalLyricsText) {
        try {
          const lrc = await LyricsService.fetchLyrics(finalTitle, finalArtist, options.duration);
          if (lrc?.syncedLyrics) {
            finalLyricsText = lrc.syncedLyrics;
          } else {
            const ytSub = await LyricsService.extractYouTubeSubtitles(url);
            if (ytSub?.syncedLyrics) {
              finalLyricsText = ytSub.syncedLyrics;
            } else if (lrc?.plainLyrics) {
              finalLyricsText = lrc.plainLyrics;
            } else if (ytSub?.plainLyrics) {
              finalLyricsText = ytSub.plainLyrics;
            }
          }
        } catch {
          // Bỏ qua lỗi tự động tìm lời khi tải
        }
      }

      if (finalLyricsText) {
        // Lưu vào thư mục lyrics trung tâm (để phục vụ sync lên Cloudflare R2)
        if (lyricsDir) {
          await fsPromises.mkdir(lyricsDir, { recursive: true });
          const lrcDestPath = path.join(lyricsDir, `${trackId}.lrc`);
          await fsPromises.writeFile(lrcDestPath, finalLyricsText, 'utf-8');
        }

        // Lưu song song file .lrc sidecar ngay cạnh file âm thanh trong thư mục bài hát
        const sidecarLrcPath = path.join(finalTrackDir, `${actualBaseName}.lrc`);
        await fsPromises.writeFile(sidecarLrcPath, finalLyricsText, 'utf-8');
        hasLyrics = true;
      }

      // 8. Tự động kiểm tra và tải Avatar Channel nghệ sĩ (artist.png + folder.png) tại thư mục Nghệ sĩ
      let artistAvatarStatus = 'Đã có sẵn tại thư mục nghệ sĩ, giữ nguyên';
      try {
        if (!fs.existsSync(artistDir)) {
          await fsPromises.mkdir(artistDir, { recursive: true });
        }

        const hasExistingArtistImg = hasArtistImage(artistDir);
        if (!hasExistingArtistImg) {
          onProgress?.(94, 'Đang tìm kiếm avatar channel nghệ sĩ...');
          const avatarBuf = await fetchChannelAvatarBuffer(url, options.channelUrl);
          if (avatarBuf && avatarBuf.length > 0) {
            // 8.1. Lưu duy nhất artist.png tại thư mục nghệ sĩ (định dạng PNG chất lượng cao không vỡ hạt)
            const artistPngPath = path.join(artistDir, 'artist.png');
            await fsPromises.writeFile(artistPngPath, avatarBuf);

            // 8.2. Lưu folder.png cho thư mục nghệ sĩ nếu chưa có
            const artistFolderPngPath = path.join(artistDir, 'folder.png');
            if (!fs.existsSync(artistFolderPngPath)) {
              await fsPromises.writeFile(artistFolderPngPath, avatarBuf);
            }

            // Dọn dẹp triệt để file artist.jpg / folder.jpg cũ nếu có (gỡ cờ hệ thống Windows trước khi unlink)
            const oldArtistJpg = path.join(artistDir, 'artist.jpg');
            if (fs.existsSync(oldArtistJpg)) {
              try {
                if (process.platform === 'win32') execFileSync('attrib', ['-r', '-h', '-s', oldArtistJpg]);
                await fsPromises.unlink(oldArtistJpg);
              } catch { /* bỏ qua */ }
            }
            const oldFolderJpg = path.join(artistDir, 'folder.jpg');
            if (fs.existsSync(oldFolderJpg)) {
              try {
                if (process.platform === 'win32') execFileSync('attrib', ['-r', '-h', '-s', oldFolderJpg]);
                await fsPromises.unlink(oldFolderJpg);
              } catch { /* bỏ qua */ }
            }

            // Ghi metadata tab Details (Curator: Kato) chuyên nghiệp cho các file ảnh PNG
            try {
              const targetArtistName = options.artist || 'Unknown Artist';
              applyArtistImageMetadata(artistPngPath, { artistName: targetArtistName, curator: 'Kato' });
              applyArtistImageMetadata(artistFolderPngPath, { artistName: targetArtistName, curator: 'Kato' });
            } catch {
              // Bỏ qua lỗi metadata nếu có
            }

            // Thiết lập thuộc tính ẩn (+h +s) cho file folder.png sau khi đã ghi metadata
            if (process.platform === 'win32') {
              try {
                if (fs.existsSync(artistFolderPngPath)) {
                  execFileSync('attrib', ['+h', '+s', artistFolderPngPath]);
                }
              } catch {
                /* bỏ qua */
              }
            }

            // 8.3. Tạo desktop.ini cho thư mục nghệ sĩ trỏ tới artist.png
            if (process.platform === 'win32') {
              try {
                const artistIniPath = path.join(artistDir, 'desktop.ini');
                if (fs.existsSync(artistIniPath)) {
                  try { execFileSync('attrib', ['-r', '-h', '-s', artistIniPath]); } catch { /* bỏ qua */ }
                }
                const artistIniContent = [
                  '[.ShellClassInfo]',
                  'FolderType=Generic',
                  '[ViewState]',
                  'Mode=1',
                  'Vid=',
                  'FolderType=Generic',
                  'Logo=artist.png',
                  '',
                ].join('\r\n');
                await fsPromises.writeFile(artistIniPath, artistIniContent, 'utf-8');
                execFileSync('attrib', ['+r', artistDir]);
                execFileSync('attrib', ['+h', '+s', artistIniPath]);
              } catch {
                /* bỏ qua */
              }
            }

            artistAvatarStatus = 'Đã tải thành công avatar channel YouTube (artist.png)';
          } else {
            artistAvatarStatus = 'Không tìm thấy avatar channel của video này';
          }
        }
      } catch (err) {
        artistAvatarStatus = `Bỏ qua do lỗi: ${err instanceof Error ? err.message : String(err)}`;
      }

      // 8.5. Tạo file info.txt ghi nhận nguồn gốc và người tải (Kato) kèm Nhật ký hoạt động
      try {
        const now = new Date();
        const downloadTimeStr = `${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${now.toLocaleDateString('vi-VN')}`;
        const formatDuration = (seconds?: number): string => {
          if (!seconds || isNaN(seconds)) return '--:--';
          const m = Math.floor(seconds / 60);
          const s = Math.floor(seconds % 60);
          return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };

        const videoId = YoutubeService.extractVideoId(url) || 'N/A';

        const infoContent = [
          '======================================================================',
          'THÔNG TIN BÀI HÁT & NGUỒN GỐC',
          '======================================================================',
          `Bài hát       : ${finalTitle}`,
          `Nghệ sĩ       : ${finalArtist}`,
          `Album         : ${finalAlbum}`,
          `Năm phát hành : ${finalYear ? String(finalYear) : 'N/A'}`,
          `Thời lượng    : ${formatDuration(options.duration)}`,
          `Định dạng     : ${audioExt.replace('.', '').toUpperCase()}`,
          `Âm lượng (LUFS): ${loudnessResult.loudnessLufs} LUFS`,
          `ReplayGain    : ${loudnessResult.replayGain >= 0 ? `+${loudnessResult.replayGain}` : loudnessResult.replayGain} dB`,
          '',
          'NGƯỜI TẢI     : Kato',
          `Ngày tải      : ${downloadTimeStr}`,
          `Nguồn gốc     : ${url}`,
          `Video ID      : ${videoId}`,
          '',
          `Lời bài hát   : ${hasLyrics ? 'Đồng bộ (.lrc)' : 'Không có'}`,
          `Ảnh bìa       : ${squareCoverBuffer ? `${actualBaseName}.jpg` : 'Không có'}`,
          'Ghi chú       : Bản lưu trữ cá nhân (Curated by Kato)',
          '======================================================================',
          '',
          '',
          '',
          '======================================================================',
          'NHẬT KÝ HOẠT ĐỘNG (ACTIVITY LOG)',
          '======================================================================',
          `[${downloadTimeStr}] - Khởi tạo tiến trình tải nhạc bởi Kato`,
          `[${downloadTimeStr}] - Tải luồng âm thanh gốc thành công (${audioExt.replace('.', '').toUpperCase()})`,
          `[${downloadTimeStr}] - Năm phát hành: ${finalYear ? String(finalYear) : 'N/A'}`,
          `[${downloadTimeStr}] - Đo độ lớn âm lượng: ${loudnessResult.loudnessLufs} LUFS (ReplayGain: ${loudnessResult.replayGain >= 0 ? `+${loudnessResult.replayGain}` : loudnessResult.replayGain} dB)`,
          `[${downloadTimeStr}] - ${hasLyrics ? 'Lấy lời bài hát đồng bộ từ LRCLIB (có timestamp)' : 'Chưa có lời bài hát gốc'}`,
          `[${downloadTimeStr}] - Xử lý ảnh bìa 1:1 và nhúng thẻ metadata (Comment: Kato)`,
          `[${downloadTimeStr}] - Ảnh đại diện nghệ sĩ: ${artistAvatarStatus}`,
          `[${downloadTimeStr}] - Lưu trữ hoàn tất các tệp tin vào thư mục`,
          '======================================================================',
          '',
        ].join('\n');

        const infoDest = path.join(finalTrackDir, 'info.txt');
        await fsPromises.writeFile(infoDest, infoContent, 'utf-8');
      } catch {
        // Bỏ qua lỗi ghi info.txt
      }

      // 9. Cấu hình Windows Folder View: desktop.ini và folder.jpg (ẩn hệ thống) để hiển thị Large Icons cho thư mục bài hát
      try {
        const iniDest = path.join(finalTrackDir, 'desktop.ini');
        const iniContent = [
          '[.ShellClassInfo]',
          'FolderType=Generic',
          '[ViewState]',
          'Mode=1',
          'Vid=',
          'FolderType=Generic',
          `Logo=${actualBaseName}.jpg`,
          '',
        ].join('\r\n');
        await fsPromises.writeFile(iniDest, iniContent, 'utf-8');

        // Tạo folder.jpg (ẩn hệ thống +h +s) để Windows Explorer bắt buộc hiển thị ảnh bìa ngoài thư mục
        if (squareCoverBuffer) {
          const folderJpgDest = path.join(finalTrackDir, 'folder.jpg');
          if (!fs.existsSync(folderJpgDest)) {
            await fsPromises.writeFile(folderJpgDest, squareCoverBuffer);
          }
          if (process.platform === 'win32') {
            try {
              execFileSync('attrib', ['+h', '+s', folderJpgDest]);
            } catch {
              /* bỏ qua lỗi gán thuộc tính ẩn cho folder.jpg */
            }
          }
        }

        if (process.platform === 'win32') {
          try {
            // Đặt thuộc tính Read-Only cho thư mục đích để Windows Explorer nhận diện desktop.ini
            execFileSync('attrib', ['+r', finalTrackDir]);
            // Đặt thuộc tính Hidden + System cho desktop.ini
            execFileSync('attrib', ['+h', '+s', iniDest]);
          } catch {
            /* bỏ qua lỗi gán thuộc tính cho desktop.ini */
          }
        }
      } catch {
        // Bỏ qua lỗi cấu hình desktop.ini
      }

      // 10. Cập nhật overrides.json và khôi phục nếu từng bị xóa
      await restoreFromTrash(trackId);
      await setTrackOverride(trackId, {
        title: finalTitle,
        artist: finalArtist,
        album: finalAlbum,
        year: finalYear,
        loudnessLufs: loudnessResult.loudnessLufs,
        replayGain: loudnessResult.replayGain,
      });

      onProgress?.(100, 'Hoàn thành nhập nhạc vào Beatify!');

      return {
        trackId,
        filePath: finalDestPath,
        albumId,
        title: finalTitle,
        artist: finalArtist,
        album: finalAlbum,
        year: finalYear,
        duration: options.duration || 0,
        hasCover,
        hasLyrics,
        loudnessLufs: loudnessResult.loudnessLufs,
        replayGain: loudnessResult.replayGain,
        artistAvatarStatus,
      };
    } finally {
      // Dọn dẹp thư mục tạm
      try {
        await fsPromises.rm(tempDir, { recursive: true, force: true });
      } catch {
        // bỏ qua
      }
    }
  },

  /**
   * Đo độ lớn âm lượng (Integrated Loudness LUFS) và tính ReplayGain chuẩn theo EBU R128
   */
  async measureLoudness(audioPath: string): Promise<{ loudnessLufs: number; replayGain: number }> {
    try {
      const res = await runCommand('ffmpeg', [
        '-i',
        audioPath,
        '-af',
        'loudnorm=print_format=json',
        '-f',
        'null',
        '-',
      ]);

      const combined = `${res.stderr}\n${res.stdout}`;
      const jsonMatch = combined.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const inputI = parseFloat(parsed.input_i);
        if (!isNaN(inputI) && isFinite(inputI)) {
          // ReplayGain chuẩn = -18.0 - input_i (dB)
          const replayGain = Number((-18.0 - inputI).toFixed(2));
          return {
            loudnessLufs: Number(inputI.toFixed(2)),
            replayGain,
          };
        }
      }
    } catch {
      // Bỏ qua lỗi nếu không đo được
    }

    return {
      loudnessLufs: -18.0,
      replayGain: 0.0,
    };
  },

  /**
   * Ghi thêm một dòng nhật ký vào file info.txt trong thư mục bài hát
   */
  appendInfoLog(dir: string, logMessage: string): void {
    try {
      const infoPath = path.join(dir, 'info.txt');
      if (!fs.existsSync(infoPath)) return;

      const currentContent = fs.readFileSync(infoPath, 'utf-8');
      const timeStr = new Date().toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const logLine = `[${timeStr}] - ${logMessage}`;

      let newContent: string;
      const logSectionHeader = 'NHẬT KÝ HOẠT ĐỘNG (ACTIVITY LOG)';
      if (currentContent.includes(logSectionHeader)) {
        let contentWithSpacing = currentContent;
        if (contentWithSpacing.includes('======================================================================\nNHẬT KÝ HOẠT ĐỘNG (ACTIVITY LOG)')) {
          contentWithSpacing = contentWithSpacing.replace(
            '======================================================================\nNHẬT KÝ HOẠT ĐỘNG (ACTIVITY LOG)',
            '======================================================================\n\n\n\n======================================================================\nNHẬT KÝ HOẠT ĐỘNG (ACTIVITY LOG)'
          );
        } else if (contentWithSpacing.includes('======================================================================\r\nNHẬT KÝ HOẠT ĐỘNG (ACTIVITY LOG)')) {
          contentWithSpacing = contentWithSpacing.replace(
            '======================================================================\r\nNHẬT KÝ HOẠT ĐỘNG (ACTIVITY LOG)',
            '======================================================================\r\n\r\n\r\n\r\n======================================================================\r\nNHẬT KÝ HOẠT ĐỘNG (ACTIVITY LOG)'
          );
        }

        const lastDivider = contentWithSpacing.lastIndexOf('======================================================================');
        if (lastDivider > contentWithSpacing.indexOf(logSectionHeader)) {
          newContent = contentWithSpacing.slice(0, lastDivider) + logLine + '\n' + contentWithSpacing.slice(lastDivider);
        } else {
          newContent = contentWithSpacing.trimEnd() + '\n' + logLine + '\n';
        }
      } else {
        newContent = currentContent.trimEnd() + '\n\n\n\n' + [
          '======================================================================',
          logSectionHeader,
          '======================================================================',
          logLine,
          '======================================================================',
          '',
        ].join('\n');
      }

      fs.writeFileSync(infoPath, newContent, 'utf-8');
    } catch {
      // bỏ qua lỗi ghi log
    }
  },
};

export const youtubeService = YoutubeService;
