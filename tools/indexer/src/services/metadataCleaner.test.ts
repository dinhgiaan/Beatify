import { describe, it, expect } from 'vitest';
import { MetadataCleaner } from './metadataCleaner';

describe('MetadataCleaner', () => {
  it('loại bỏ các từ khóa rác phổ biến trong tiêu đề YouTube', () => {
    const cases = [
      {
        input: 'Chúng Ta Của Tương Lai [Official Music Video]',
        expected: 'Chúng Ta Của Tương Lai',
      },
      {
        input: 'Cắt Đôi Nỗi Sầu (Lyric Video)',
        expected: 'Cắt Đôi Nỗi Sầu',
      },
      {
        input: 'See Tình 【Official Audio】',
        expected: 'See Tình',
      },
      {
        input: 'Waiting For You | Official MV',
        expected: 'Waiting For You',
      },
      {
        input: 'Bật Tình Yêu Lên - Official MV',
        expected: 'Bật Tình Yêu Lên',
      },
      {
        input: 'Ai Chung Tình Được Mãi #aichungtinh #mv',
        expected: 'Ai Chung Tình Được Mãi',
      },
    ];

    for (const c of cases) {
      const res = MetadataCleaner.clean({ title: c.input });
      expect(res.title).toBe(c.expected);
    }
  });

  it('chuẩn hóa tên kênh phát hành và loại bỏ VEVO / Topic', () => {
    expect(MetadataCleaner.normalizeChannelName('Adele - Topic')).toBe('Adele');
    expect(MetadataCleaner.normalizeChannelName('Sơn Tùng M-TP Official')).toBe('Sơn Tùng M-TP');
    expect(MetadataCleaner.normalizeChannelName('TaylorSwiftVEVO')).toBe('Taylor Swift');
    expect(MetadataCleaner.normalizeChannelName('DenVau Official Channel')).toBe('DenVau');
    expect(MetadataCleaner.normalizeChannelName(undefined)).toBe('Unknown Artist');
  });

  it('tách danh sách nghệ sĩ khi có ft, feat, x, &, dấu phẩy', () => {
    const res1 = MetadataCleaner.parseArtists('Sơn Tùng M-TP feat. Snoop Dogg');
    expect(res1.mainArtist).toBe('Sơn Tùng M-TP');
    expect(res1.artists).toEqual(['Sơn Tùng M-TP', 'Snoop Dogg']);

    const res2 = MetadataCleaner.parseArtists('HIEUTHUHAI x HURRYKNG & MANBO');
    expect(res2.mainArtist).toBe('HIEUTHUHAI');
    expect(res2.artists).toEqual(['HIEUTHUHAI', 'HURRYKNG', 'MANBO']);

    const res3 = MetadataCleaner.parseArtists('Đen, JustaTee');
    expect(res3.mainArtist).toBe('Đen');
    expect(res3.artists).toEqual(['Đen', 'JustaTee']);
  });

  it('nhận diện định dạng Artist - Title từ tiêu đề', () => {
    const res = MetadataCleaner.clean({
      title: 'Vũ. - Bước Qua Mùa Cô Đơn (Official Audio)',
      channel: 'Vũ. Official',
    });
    expect(res.artist).toBe('Vũ.');
    expect(res.title).toBe('Bước Qua Mùa Cô Đơn');
    expect(res.confidence).toBe('high');
    expect(res.source).toBe('regex');
  });

  it('ưu tiên dữ liệu chuẩn nếu có sẵn track và artist từ YouTube Music', () => {
    const res = MetadataCleaner.clean({
      title: 'Ignore this title',
      track: 'Nơi Này Có Anh',
      artist: 'Sơn Tùng M-TP',
      album: 'm-tp M-TP',
    });
    expect(res.title).toBe('Nơi Này Có Anh');
    expect(res.artist).toBe('Sơn Tùng M-TP');
    expect(res.album).toBe('m-tp M-TP');
    expect(res.confidence).toBe('high');
    expect(res.source).toBe('yt-music');
  });

  it('xử lý chuẩn xác ca khúc có hậu tố hiệu ứng âm thanh và nghệ sĩ ft như Meek Mill Going Bad', () => {
    const res = MetadataCleaner.clean({
      title: 'Meek Mill - Going Bad ft. Drake (Official Audio) | @432 hz',
    });
    expect(res.title).toBe('Going Bad');
    expect(res.artist).toBe('Meek Mill');
    expect(res.artists).toEqual(['Meek Mill', 'Drake']);
  });
});
