import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { getImageDimensions } from './imageDimensions';

/**
 * Tự động chuyển đổi ảnh chữ nhật (16:9, 4:3, ...) sang ảnh vuông 1:1 nền mờ Ambient Glow
 * Nếu ảnh đã vuông (hoặc gần vuông 0.95 - 1.05) hoặc ảnh dọc, giữ nguyên không cần convert.
 */
export async function convertToSquareAmbientCover(buffer: Buffer): Promise<Buffer> {
  const dim = getImageDimensions(buffer);
  if (!dim || dim.width <= 0 || dim.height <= 0) return buffer;

  const aspect = dim.width / dim.height;
  // Nếu đã vuông (hoặc gần vuông 0.95 - 1.05) hoặc ảnh dọc, không cần convert
  if (aspect <= 1.05) {
    return buffer;
  }

  const targetSize = Math.max(dim.width, dim.height, 1280);
  const randomSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempInput = path.join(os.tmpdir(), `beatify_cov_in_${randomSuffix}.jpg`);
  const tempOutput = path.join(os.tmpdir(), `beatify_cov_out_${randomSuffix}.jpg`);

  try {
    await fs.writeFile(tempInput, buffer);
    const filter = `[0:v]scale=${targetSize}:${targetSize}:force_original_aspect_ratio=increase,crop=${targetSize}:${targetSize},boxblur=40:5,eq=brightness=-0.12[bg];[0:v]scale=${dim.width}:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-y',
        '-i',
        tempInput,
        '-filter_complex',
        filter,
        '-q:v',
        '2',
        tempOutput,
      ]);

      proc.on('close', (code) => {
        if (code === 0 && existsSync(tempOutput)) {
          resolve();
        } else {
          reject(new Error(`ffmpeg kết thúc với mã lỗi ${code}`));
        }
      });
      proc.on('error', reject);
    });

    const resultBuffer = await fs.readFile(tempOutput);
    return resultBuffer;
  } catch (err) {
    console.warn('[imageConversionService] Không thể convert ảnh sang 1:1 ambient blur, giữ nguyên ảnh gốc:', err);
    return buffer;
  } finally {
    if (existsSync(tempInput)) await fs.unlink(tempInput).catch(() => {});
    if (existsSync(tempOutput)) await fs.unlink(tempOutput).catch(() => {});
  }
}

