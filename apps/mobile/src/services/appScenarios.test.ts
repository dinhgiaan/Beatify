import { describe, it, expect } from 'vitest';
import { smartShuffle } from '@music-app/shared';
import type { Track, UpdateTrack } from '@music-app/shared';

// Hàm formatTime trích xuất từ app/index.tsx
function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function makeTrack(id: string, artist = 'Artist', title = `Track ${id}`, duration = 180): Track {
  return {
    id,
    file: `music/${id}.mp3`,
    storage: 'r2',
    title,
    artist,
    album: 'Album Test',
    duration,
  };
}

describe('Kiểm thử Toàn bộ Kịch bản Ứng dụng Mobile (App Scenarios Test Suite)', () => {
  describe('Kịch bản 1: Định dạng thời lượng bài hát formatTime', () => {
    it('định dạng đúng các mốc thời gian tiêu chuẩn phút:giây', () => {
      expect(formatTime(0)).toBe('0:00');
      expect(formatTime(9)).toBe('0:09');
      expect(formatTime(65)).toBe('1:05');
      expect(formatTime(3599)).toBe('59:59');
    });

    it('hỗ trợ hiển thị giờ:phút:giây cho bài hát/podcast dài trên 1 tiếng', () => {
      expect(formatTime(3600)).toBe('1:00:00');
      expect(formatTime(3665)).toBe('1:01:05');
      expect(formatTime(7200 + 125)).toBe('2:02:05');
    });

    it('xử lý an toàn tuyệt đối các giá trị bất thường (NaN, âm, vô cực)', () => {
      expect(formatTime(-10)).toBe('0:00');
      expect(formatTime(NaN)).toBe('0:00');
      expect(formatTime(Infinity)).toBe('0:00');
      expect(formatTime(-Infinity)).toBe('0:00');
    });
  });

  describe('Kịch bản 2: Logic Seek Bar & Tua nhạc an toàn', () => {
    function computeSeekTarget(currentSec: number, offsetSec: number, totalSec: number): number {
      if (totalSec <= 0) {
        return Math.max(0, currentSec + offsetSec);
      }
      return Math.min(totalSec, Math.max(0, currentSec + offsetSec));
    }

    it('không bao giờ tua lùi xuống giá trị âm', () => {
      const target = computeSeekTarget(2, -5, 180);
      expect(target).toBe(0);
    });

    it('không bao giờ tua tiến vượt quá tổng thời lượng bài hát', () => {
      const target = computeSeekTarget(178, 5, 180);
      expect(target).toBe(180);
    });

    it('tua bình thường trong khoảng hợp lệ', () => {
      const target = computeSeekTarget(60, 5, 180);
      expect(target).toBe(65);
    });
  });

  describe('Kịch bản 3: Quản lý hàng đợi khi Xóa / Sửa / Thêm bài khi đang Trộn bài', () => {
    it('khi xóa bài đứng trước bài đang phát, index bài đang phát tự lùi 1 để không bị nhảy sai bài', () => {
      let tracks = [makeTrack('1'), makeTrack('2'), makeTrack('3'), makeTrack('4')];
      let currentTrackIndex = 2; // Đang nghe bài '3' (index 2)

      const trackIdToDelete = '1'; // Xóa bài '1' (index 0)
      const targetIdx = tracks.findIndex((t) => t.id === trackIdToDelete);
      tracks = tracks.filter((t) => t.id !== trackIdToDelete);

      if (targetIdx < currentTrackIndex) {
        currentTrackIndex = Math.max(0, currentTrackIndex - 1);
      }

      expect(tracks).toHaveLength(3);
      expect(currentTrackIndex).toBe(1);
      expect(tracks[currentTrackIndex]?.id).toBe('3'); // Vẫn là bài '3' đang phát!
    });

    it('khi xóa bài đang phát, tự động chuyển sang bài kế tiếp', () => {
      let tracks = [makeTrack('1'), makeTrack('2'), makeTrack('3')];
      let currentTrackIndex = 1; // Đang nghe bài '2'

      const trackIdToDelete = '2';
      const targetIdx = tracks.findIndex((t) => t.id === trackIdToDelete);
      tracks = tracks.filter((t) => t.id !== trackIdToDelete);

      if (tracks[currentTrackIndex]?.id === trackIdToDelete || targetIdx === currentTrackIndex) {
        const nextIdx = Math.min(targetIdx, tracks.length - 1);
        currentTrackIndex = nextIdx;
      }

      expect(tracks).toHaveLength(2);
      expect(currentTrackIndex).toBe(1);
      expect(tracks[currentTrackIndex]?.id).toBe('3'); // Chuyển sang bài '3'
    });

    it('khi xóa bài duy nhất còn lại, hàng đợi về rỗng và index về 0', () => {
      let tracks = [makeTrack('1')];
      let currentTrackIndex = 0;

      tracks = tracks.filter((t) => t.id !== '1');
      if (tracks.length === 0) {
        currentTrackIndex = 0;
      }

      expect(tracks).toHaveLength(0);
      expect(currentTrackIndex).toBe(0);
    });

    it('khi tắt Smart Shuffle, bài đã xóa không bị hồi sinh lại từ danh sách gốc', () => {
      let originalTracks = [makeTrack('1'), makeTrack('2'), makeTrack('3')];
      let tracks = smartShuffle(originalTracks, '1');

      // Người dùng xóa bài '2' khi đang bật shuffle
      const toDelete = '2';
      tracks = tracks.filter((t) => t.id !== toDelete);
      originalTracks = originalTracks.filter((t) => t.id !== toDelete);

      // Cả tracks đang phát lẫn originalTracks đều không còn bài '2'
      expect(tracks.find((t) => t.id === '2')).toBeUndefined();
      expect(originalTracks.find((t) => t.id === '2')).toBeUndefined();
      expect(originalTracks).toHaveLength(2);
    });

    it('khi sửa metadata bài hát khi đang shuffle, cập nhật cả danh sách gốc', () => {
      let originalTracks = [makeTrack('1', 'Sơn Tùng M-TP', 'Nắng Ấm Xa Dần')];
      let tracks = [...originalTracks];

      const newTitle = 'Nắng Ấm Xa Dần (Remix)';
      const updates: UpdateTrack = { title: newTitle };
      tracks = tracks.map((t) => (t.id === '1' ? { ...t, title: updates.title ?? t.title } : t));
      originalTracks = originalTracks.map((t) =>
        t.id === '1' ? { ...t, title: updates.title ?? t.title } : t
      );

      expect(tracks[0]?.title).toBe('Nắng Ấm Xa Dần (Remix)');
      expect(originalTracks[0]?.title).toBe('Nắng Ấm Xa Dần (Remix)');
    });
  });

  describe('Kịch bản 4: Chuẩn hóa URL khi đồng bộ Cloudflare', () => {
    function cleanServerUrl(url: string): string {
      return url.trim().replace(/\/+$/, '');
    }

    it('tự động loại bỏ khoảng trắng và dấu gạch chéo cuối để tránh lỗi 404', () => {
      expect(cleanServerUrl('  https://my-worker.workers.dev/  ')).toBe('https://my-worker.workers.dev');
      expect(cleanServerUrl('http://192.168.1.10:8787///')).toBe('http://192.168.1.10:8787');
      expect(cleanServerUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
    });
  });

  describe('Kịch bản 5: Profile Validation', () => {
    function sanitizeProfileName(input: string): string {
      const trimmed = input.trim();
      return (trimmed.length > 0 ? trimmed : 'Người Yêu Nhạc').slice(0, 32);
    }

    it('tên trống hoặc chỉ có khoảng trắng tự động fallback về Người Yêu Nhạc', () => {
      expect(sanitizeProfileName('')).toBe('Người Yêu Nhạc');
      expect(sanitizeProfileName('   ')).toBe('Người Yêu Nhạc');
    });

    it('tên hợp lệ được giữ nguyên và cắt gọn tối đa 32 ký tự', () => {
      expect(sanitizeProfileName('An Đinh')).toBe('An Đinh');
      const longName = 'Tên Người Yêu Âm Nhạc Rất Dài Quá Ba Mươi Hai Ký Tự Này';
      expect(sanitizeProfileName(longName).length).toBeLessThanOrEqual(32);
    });
  });
});
