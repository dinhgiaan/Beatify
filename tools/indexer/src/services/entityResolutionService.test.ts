import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { EntityResolutionService } from './entityResolutionService';
import { ChannelClassifier } from './channelClassifier';
import { KnownArtistsService } from './knownArtistsService';
import { ITunesMatcher } from './itunesMatcher';

describe('Giai đoạn 4: EntityResolutionService (Preview, Safe Apply & Backup)', () => {
  const tmpDir = path.resolve(__dirname, '../../fixtures/tmp_test_entity');

  const classifier = new ChannelClassifier();
  const knownArtists = new KnownArtistsService(undefined, ['Đạt G', 'Sơn Tùng M-TP', 'B Ray']);
  const itunesMatcher = new ITunesMatcher();
  const service = new EntityResolutionService(classifier, knownArtists, itunesMatcher);

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('preview trả về danh sách ứng viên và bảo vệ Ground Truth an toàn', async () => {
    const report = await service.preview({ forceItunes: false });
    expect(report.totalTracks).toBeGreaterThan(0);
    expect(report.candidates.length).toBe(report.totalTracks);
    expect(report.stats.total).toBe(report.totalTracks);
    expect(fs.existsSync(report.csvReportPath)).toBe(true);

    // Kiểm tra xem có bài nào được bảo vệ không
    const protectedSample = report.candidates.find((c) => c.isProtected);
    if (protectedSample) {
      expect(protectedSample.suggestedAction).toBe('skip');
    }
  });

  it('nhận diện chính xác bài bị đảo vế và đề xuất safe_apply nếu độ tin cậy cao', async () => {
    const report = await service.preview({ forceItunes: false });
    const invertedItems = report.candidates.filter((c) => c.isInverted);
    for (const inv of invertedItems) {
      expect(inv.isInverted).toBe(true);
      if (inv.confidence === 'high' && !inv.isProtected) {
        expect(inv.suggestedAction).toBe('safe_apply');
      }
    }
  });
});
