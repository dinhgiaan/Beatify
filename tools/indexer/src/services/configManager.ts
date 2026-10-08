import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const ENV_FILE = process.cwd().endsWith('indexer')
  ? path.resolve(process.cwd(), '.env')
  : path.resolve(process.cwd(), 'tools/indexer/.env');

export async function updateFoldersConfig(sourceDir: string, importDir?: string): Promise<{ sourceDir: string; importDir: string }> {
  const normSource = sourceDir.trim().replace(/\\/g, '/');
  const normImport = (importDir ? importDir.trim() : path.join(normSource, '_imported')).replace(/\\/g, '/');

  // Đảm bảo thư mục tồn tại trên ổ đĩa
  await fs.mkdir(normSource, { recursive: true });
  if (normImport) {
    await fs.mkdir(normImport, { recursive: true });
  }

  // Cập nhật runtime process.env
  process.env.MUSIC_SOURCE_DIR = normSource;
  process.env.MUSIC_IMPORT_DIR = normImport;

  // Cập nhật hoặc tạo file .env
  let content = '';
  if (existsSync(ENV_FILE)) {
    content = await fs.readFile(ENV_FILE, 'utf-8');
  }

  // Thay thế hoặc chèn dòng MUSIC_SOURCE_DIR
  if (/^MUSIC_SOURCE_DIR=.*$/m.test(content)) {
    content = content.replace(/^MUSIC_SOURCE_DIR=.*$/m, `MUSIC_SOURCE_DIR=${normSource}`);
  } else {
    content += `\nMUSIC_SOURCE_DIR=${normSource}`;
  }

  // Thay thế hoặc chèn dòng MUSIC_IMPORT_DIR
  if (/^MUSIC_IMPORT_DIR=.*$/m.test(content)) {
    content = content.replace(/^MUSIC_IMPORT_DIR=.*$/m, `MUSIC_IMPORT_DIR=${normImport}`);
  } else {
    content += `\nMUSIC_IMPORT_DIR=${normImport}`;
  }

  await fs.writeFile(ENV_FILE, content.trim() + '\n', 'utf-8');

  return { sourceDir: normSource, importDir: normImport };
}
