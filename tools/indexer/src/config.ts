import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Nạp .env từ thư mục gốc và tools/indexer
export function reloadEnv(): void {
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
  dotenv.config({ path: path.resolve(process.cwd(), 'tools/indexer/.env'), override: true });
}

reloadEnv();

const ConfigSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1, 'Thiếu R2_ACCOUNT_ID trong .env'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'Thiếu R2_ACCESS_KEY_ID trong .env'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'Thiếu R2_SECRET_ACCESS_KEY trong .env'),
  R2_BUCKET: z.string().min(1, 'Thiếu R2_BUCKET trong .env'),
  MUSIC_SOURCE_DIR: z.string().min(1, 'Thiếu MUSIC_SOURCE_DIR trong .env'),
  MUSIC_IMPORT_DIR: z.string().optional(),
});

export type IndexerConfig = z.infer<typeof ConfigSchema>;

export interface LocalConfig {
  MUSIC_SOURCE_DIR: string;
  MUSIC_IMPORT_DIR?: string;
  R2_BUCKET?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  isR2Configured: boolean;
}

export function loadLocalConfig(): LocalConfig {
  reloadEnv();
  const sourceDir =
    process.env.MUSIC_SOURCE_DIR?.trim() ||
    path.resolve(process.cwd(), 'music_source');
  const importDir =
    process.env.MUSIC_IMPORT_DIR?.trim() ||
    path.join(sourceDir, '_imported');

  const isR2Configured = Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
    process.env.R2_ACCESS_KEY_ID?.trim() &&
    process.env.R2_SECRET_ACCESS_KEY?.trim() &&
    process.env.R2_BUCKET?.trim()
  );

  return {
    MUSIC_SOURCE_DIR: sourceDir,
    MUSIC_IMPORT_DIR: importDir,
    R2_BUCKET: process.env.R2_BUCKET?.trim() || 'beatify-music',
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID?.trim() || undefined,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID?.trim() || undefined,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY?.trim() || undefined,
    isR2Configured,
  };
}

export function loadConfig(allowMissing = false): IndexerConfig | null {
  reloadEnv();
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    if (allowMissing) return null;
    const errors = result.error.issues.map((e) => e.message).join(', ');
    throw new Error(`Lỗi cấu hình .env: ${errors}`);
  }
  return result.data;
}
