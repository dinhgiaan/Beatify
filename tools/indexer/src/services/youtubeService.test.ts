import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { YoutubeService, resolveDestinationPaths } from './youtubeService';

describe('YoutubeService', () => {
  it('kiểm tra hợp lệ URL YouTube và YouTube Music', () => {
    expect(YoutubeService.isValidYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(YoutubeService.isValidYoutubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(YoutubeService.isValidYoutubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(YoutubeService.isValidYoutubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);

    expect(YoutubeService.isValidYoutubeUrl('https://soundcloud.com/artist/track')).toBe(false);
    expect(YoutubeService.isValidYoutubeUrl('not-a-url')).toBe(false);
    expect(YoutubeService.isValidYoutubeUrl('')).toBe(false);
  });

  it('bóc tách video ID chính xác từ URL', () => {
    expect(YoutubeService.extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(YoutubeService.extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(YoutubeService.extractVideoId('https://music.youtube.com/watch?v=abc123XYZ_0&list=PL123')).toBe('abc123XYZ_0');
    expect(YoutubeService.extractVideoId('https://google.com')).toBe(null);
  });

  describe('resolveDestinationPaths - Tổ chức phân cấp thư mục Singles/<Tên bài nhạc>', () => {
    it('khi baseTargetDir là Singles: tạo folder con theo tên bài nhạc', () => {
      const res = resolveDestinationPaths('D:/music/_imported/morray/Singles', 'morray', 'Singles', 'quicksand');
      expect(res.isSingle).toBe(true);
      expect(res.finalTrackDir.replace(/\\/g, '/')).toContain('/morray/Singles/quicksand');
      expect(res.artistDir.replace(/\\/g, '/')).toContain('/morray');
    });

    it('khi baseTargetDir là thư mục nghệ sĩ: tạo Singles/<Tên bài nhạc>', () => {
      const res = resolveDestinationPaths('D:/music/_imported/morray', 'morray', 'Singles', 'quicksand');
      expect(res.isSingle).toBe(true);
      expect(res.finalTrackDir.replace(/\\/g, '/')).toContain('/morray/Singles/quicksand');
      expect(res.artistDir.replace(/\\/g, '/')).toContain('/morray');
    });

    it('khi baseTargetDir là thư mục gốc: tạo <Nghệ sĩ>/Singles/<Tên bài nhạc>', () => {
      const res = resolveDestinationPaths('D:/music/_imported', 'morray', 'Singles', 'quicksand');
      expect(res.isSingle).toBe(true);
      expect(res.finalTrackDir.replace(/\\/g, '/')).toContain('/_imported/morray/Singles/quicksand');
      expect(res.artistDir.replace(/\\/g, '/')).toContain('/_imported/morray');
    });

    it('khi bài thuộc Album cụ thể: tạo thư mục theo tên Album', () => {
      const res = resolveDestinationPaths('D:/music/_imported', 'morray', 'Street Sermons', 'quicksand');
      expect(res.isSingle).toBe(false);
      expect(res.finalTrackDir.replace(/\\/g, '/')).toContain('/_imported/morray/Street Sermons');
    });
  });
});
