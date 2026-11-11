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

  it('nhận diện chuẩn xác video Sơn Tùng M-TP với dấu pipe và không cắt nhầm hyphen M-TP thành TP', () => {
    const res = MetadataCleaner.clean({
      title: 'Buông Đôi Tay Nhau Ra | OFFICIAL MUSIC VIDEO | Sơn Tùng M-TP',
      channel: 'Sơn Tùng M-TP Official',
    });
    expect(res.title).toBe('Buông Đôi Tay Nhau Ra');
    expect(res.artist).toBe('Sơn Tùng M-TP');
    expect(res.artists).toEqual(['Sơn Tùng M-TP']);
  });

  it('nhận diện chuẩn xác video phân nhánh đa nghệ sĩ và nhóm rap như Rapital Xích Thêm Chút Remix', () => {
    const res = MetadataCleaner.clean({
      title: 'Xích Thêm Chút - XTC Remix | RPT Groovie ft TLinh x RPT MCK (Prod. by fat_benn & RPT LT)| RAPITALOVE',
      channel: 'Rapital Official',
    });
    expect(res.title).toBe('Xích Thêm Chút - XTC Remix');
    expect(res.artist).toBe('RPT Groovie');
    expect(res.artists).toEqual(['RPT Groovie', 'TLinh', 'RPT MCK']);
    expect(res.album).toBe('RAPITALOVE');
  });

  it('nhận diện định dạng ngược Title - Artist phổ biến tại Việt Nam (Cơn Mưa Cuối, Sống Cho Hết Đời Thanh Xuân)', () => {
    const res1 = MetadataCleaner.clean({
      title: '(Lyric Video) Cơn Mưa Cuối - JustaTee x Binz',
      channel: 'JustaTee Music',
    });
    expect(res1.title).toBe('Cơn Mưa Cuối');
    expect(res1.artist).toBe('JustaTee');
    expect(res1.artists).toEqual(['JustaTee', 'Binz']);

    const res2 = MetadataCleaner.clean({
      title: 'SỐNG CHO HẾT ĐỜI THANH XUÂN 2 - BCTM x TNS',
      channel: 'TNS Channel',
    });
    expect(res2.title).toBe('Sống Cho Hết Đời Thanh Xuân 2');
    expect(res2.artist).toBe('BCTM');
    expect(res2.artists).toEqual(['BCTM', 'TNS']);
  });

  it('không cắt nhầm dấu gạch nối trong Spider-Man hay tên danh từ ghép', () => {
    const res = MetadataCleaner.clean({
      title: 'Post Malone - Sunflower (Spider-Man: Into the Spider-Verse)',
      channel: 'Post Malone',
    });
    expect(res.title).toBe('Sunflower (Spider-Man: Into the Spider-Verse)');
    expect(res.artist).toBe('Post Malone');
  });
});
