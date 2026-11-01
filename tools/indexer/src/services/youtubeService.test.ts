import { describe, it, expect } from 'vitest';
import { YoutubeService } from './youtubeService';

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
});
