import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PathSanitizer } from './pathSanitizer';
import fs from 'fs/promises';
import path from 'path';

describe('PathSanitizer', () => {
  const testDir = path.join(process.cwd(), 'temp_test_sanitizer');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('làm sạch các ký tự cấm trên Windows filesystem', () => {
    expect(PathSanitizer.sanitizeSegment('Song: With / Slash * Star ? Question')).toBe(
      'Song- With - Slash - Star - Question'
    );
    expect(PathSanitizer.sanitizeSegment('Trailing Dot...')).toBe('Trailing Dot');
    expect(PathSanitizer.sanitizeSegment('   Trailing Spaces   ')).toBe('Trailing Spaces');
  });

  it('bọc các tên thiết bị dành riêng của Windows', () => {
    expect(PathSanitizer.sanitizeSegment('CON')).toBe('_CON_');
    expect(PathSanitizer.sanitizeSegment('PRN')).toBe('_PRN_');
    expect(PathSanitizer.sanitizeSegment('aux')).toBe('_aux_');
    expect(PathSanitizer.sanitizeSegment('NUL.txt')).toBe('_NUL.txt_');
  });

  it('cắt ngắn chuỗi an toàn với dấu chấm lửng', () => {
    expect(PathSanitizer.truncateString('Hello World', 5)).toBe('Hell…');
    expect(PathSanitizer.truncateString('Hi', 10)).toBe('Hi');
  });

  it('khống chế ngân sách độ dài đường dẫn MAX_PATH của Windows', () => {
    const longName = 'A'.repeat(300);
    const safeFile = PathSanitizer.enforceMaxPathBudget('C:\\Music', longName, '.mp3', 100);
    expect(safeFile.endsWith('.mp3')).toBe(true);
    expect(('C:\\Music\\' + safeFile).length).toBeLessThanOrEqual(100);
  });

  it('safeMoveFile di chuyển file thành công', async () => {
    const src = path.join(testDir, 'source.txt');
    const dest = path.join(testDir, 'sub', 'destination.txt');
    await fs.writeFile(src, 'test content', 'utf-8');

    await PathSanitizer.safeMoveFile(src, dest);

    const exists = await fs.stat(dest).then(() => true).catch(() => false);
    expect(exists).toBe(true);
    const content = await fs.readFile(dest, 'utf-8');
    expect(content).toBe('test content');
  });
});
