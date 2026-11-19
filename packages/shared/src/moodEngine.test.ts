import { describe, it, expect } from 'vitest';
import {
  analyzeTrackMood,
  predictUserMood,
  extractTextTokens,
} from './moodEngine';
import type { Track } from './schemas';

function createTrack(id: string, title: string, artist: string, extra: Partial<Track> = {}): Track {
  return {
    id,
    title,
    artist,
    duration: 200,
    file: `music/${id}.mp3`,
    storage: 'r2',
    ...extra,
  };
}

describe('moodEngine - Phân tích & Dự đoán Cảm xúc Âm nhạc', () => {
  describe('extractTextTokens', () => {
    it('trích xuất chuẩn xác từ tiếng Việt và tiếng Anh có dấu', () => {
      const tokens = extractTextTokens('Cơn Mưa Ngang Qua (Prod. by Mikeezy) - Chill Vibe');
      expect(tokens).toContain('cơn');
      expect(tokens).toContain('mưa');
      expect(tokens).toContain('chill');
      expect(tokens).toContain('vibe');
    });
  });

  describe('analyzeTrackMood', () => {
    it('nhận diện chính xác bài hát u buồn / suy tư (Melancholy)', () => {
      const track = createTrack('t1', 'Nước Mắt Buồn Trong Mưa', 'Vũ', {
        genre: 'Ballad',
        key: '8A', // Minor key
        bpm: 75,
      });

      const profile = analyzeTrackMood(track);
      expect(profile.primaryMood).toBe('melancholy');
      expect(profile.valence).toBeLessThan(0.5); // Buồn -> valence thấp
      expect(profile.tags).toContain('buồn');
      expect(profile.tags).toContain('mưa');
    });

    it('nhận diện chính xác bài hát thư giãn / êm dịu (Chill)', () => {
      const track = createTrack('t2', 'Gió Lofi Chiều Bình Yên', 'Hoàng Dũng', {
        genre: 'Acoustic Lofi',
        bpm: 90,
        replayGain: -3.5, // Âm lượng mộc, êm
      });

      const profile = analyzeTrackMood(track);
      expect(profile.primaryMood).toBe('chill');
      expect(profile.arousal).toBeLessThan(0.6);
      expect(profile.tags).toContain('chill');
      expect(profile.tags).toContain('lofi');
    });

    it('nhận diện chính xác bài hát sôi động / bùng nổ (Energetic)', () => {
      const track = createTrack('t3', 'Cháy Phố Đêm Quẩy Bùng Nổ', 'B Ray', {
        genre: 'Hip-Hop Trap',
        bpm: 140,
        replayGain: -11.0,
      });

      const profile = analyzeTrackMood(track);
      expect(profile.primaryMood).toBe('energetic');
      expect(profile.arousal).toBeGreaterThan(0.6); // Năng lượng cao
      expect(profile.tags).toContain('cháy');
      expect(profile.tags).toContain('quẩy');
    });

    it('nhận diện chính xác bài hát tươi sáng / lạc quan (Uplifting)', () => {
      const track = createTrack('t4', 'Yêu Đời Nắng Hè Rực Rỡ', 'Amee', {
        genre: 'Pop Dance',
        key: '11B', // Major key
        bpm: 118,
      });

      const profile = analyzeTrackMood(track);
      expect(profile.primaryMood).toBe('uplifting');
      expect(profile.valence).toBeGreaterThan(0.6); // Tươi sáng -> valence cao
      expect(profile.tags).toContain('yêu');
      expect(profile.tags).toContain('nắng');
    });
  });

  describe('predictUserMood', () => {
    const trackSad = createTrack('sad-1', 'Cơn Mưa Cô Đơn', 'Singer A', { genre: 'Ballad', key: '8A', bpm: 72 });
    const trackHappy = createTrack('happy-1', 'Nắng Ấm Nụ Cười Vui Vẻ', 'Singer B', { genre: 'Pop', key: '8B', bpm: 120 });
    const trackHype = createTrack('hype-1', 'Cháy Phố Bùng Nổ Party', 'Rapper C', { genre: 'Trap', bpm: 145 });

    const tracksMap = new Map<string, Track>([
      ['sad-1', trackSad],
      ['happy-1', trackHappy],
      ['hype-1', trackHype],
    ]);

    it('dự đoán tâm trạng Trầm lắng khi người dùng vừa nghe chuỗi bài buồn', () => {
      const pred = predictUserMood({
        now: new Date(2026, 10, 19, 14, 0).getTime(), // Ban ngày
        recentTrackIds: ['sad-1', 'sad-1'],
        tracksMap,
      });

      expect(pred.mood).toBe('melancholy');
      expect(pred.title).toContain('Trầm lắng');
      expect(pred.confidence).toBeGreaterThan(0.7);
    });

    it('dự đoán tâm trạng Bùng nổ năng lượng khi người dùng vừa nghe nhạc sôi động', () => {
      const pred = predictUserMood({
        now: new Date(2026, 10, 19, 15, 0).getTime(),
        recentTrackIds: ['hype-1', 'hype-1'],
        tracksMap,
      });

      expect(pred.mood).toBe('energetic');
      expect(pred.title).toContain('Bùng nổ năng lượng');
      expect(pred.confidence).toBeGreaterThan(0.7);
    });

    it('dự đoán cảm xúc ban đêm khi chưa có lịch sử nghe gần (Cold Start)', () => {
      // 23:30 đêm muộn
      const nightNow = new Date(2026, 10, 19, 23, 30).getTime();
      const pred = predictUserMood({
        now: nightNow,
        recentTrackIds: [],
        tracksMap,
      });

      // Ban đêm mặc định hướng về trầm lắng hoặc thư thái
      expect(['melancholy', 'chill']).toContain(pred.mood);
    });

    it('dự đoán cảm xúc buổi sáng khi chưa có lịch sử nghe gần (Cold Start)', () => {
      // 07:30 sáng sớm
      const morningNow = new Date(2026, 10, 19, 7, 30).getTime();
      const pred = predictUserMood({
        now: morningNow,
        recentTrackIds: [],
        tracksMap,
      });

      // Buổi sáng khởi đầu tươi sáng
      expect(pred.mood).toBe('uplifting');
      expect(pred.badgeText).toBe('Lạc quan');
    });
  });
});
