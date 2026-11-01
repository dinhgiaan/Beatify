export interface CleanedMetadata {
  title: string;
  artist: string;
  albumArtist: string;
  artists: string[];
  album?: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceReason?: string;
  source: 'yt-music' | 'regex';
}

// Các từ khóa rác phổ biến trong tiêu đề YouTube / MV / Audio
const JUNK_PATTERNS = [
  /\[\s*(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s+video|lyric|lyrics|visualizer|hd|4k|remastered)\s*\]/gi,
  /\(\s*(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s+video|lyric|lyrics|visualizer|hd|4k|remastered)\s*\)/gi,
  /【\s*(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s+video)\s*】/gi,
  /\|\s*(?:official\s+)?(?:mv|music\s+video|audio|lyrics?|lyric\s+video)\s*(?=\||$)/gi,
  /\|\s*(?:@?\d+\s*hz|8d(?:\s*audio)?|slowed(?:\s*\+\s*reverb)?|bass\s*boosted|nightcore|speed\s*up|pitched|remaster(?:ed)?|instrumental|karaoke).*$/gi,
  /\|\s*prod(?:\.|\s+by)?.*$/gi,
  /\s*-\s*(?:official\s+)?(?:mv|music\s+video|audio|lyric\s+video)\s*$/gi,
  /#\w+/g, // hashtags
];

export const MetadataCleaner = {
  /**
   * Chuẩn hóa tên kênh phát hành về tên nghệ sĩ:
   * - Cắt hậu tố: ' - Topic', ' Official Channel', ' Official', ' Channel'
   * - Xử lý VEVO: 'AdeleVEVO' -> 'Adele', 'TaylorSwiftVEVO' -> 'Taylor Swift'
   */
  normalizeChannelName(channelName?: string): string {
    if (!channelName) return 'Unknown Artist';
    let clean = channelName.normalize('NFC').trim();

    // 1. Cắt Topic
    clean = clean.replace(/\s*-\s*Topic$/i, '').trim();

    // 2. Cắt VEVO (kể cả viết liền như AdeleVEVO, TaylorSwiftVEVO)
    if (/VEVO$/i.test(clean)) {
      clean = clean.replace(/VEVO$/i, '').trim();
      clean = clean.replace(/([a-z])([A-Z])/g, '$1 $2');
    }

    // 3. Cắt Official Channel / Official
    clean = clean.replace(/\s+(?:Official(?:\s+Channel)?|Channel)$/i, '').trim();

    return clean || 'Unknown Artist';
  },

  /**
   * Chuyển chuỗi ALL CAPS sang Title Case an toàn cho tiếng Việt
   */
  toSafeTitleCase(str: string): string {
    if (!str) return '';
    const isAllUpper = str === str.toUpperCase() && str !== str.toLowerCase() && str.length > 3;
    if (!isAllUpper) return str;

    return str
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  /**
   * Tách danh sách nghệ sĩ khi có các từ nối feat., ft., x, &, dấu phẩy
   */
  parseArtists(artistStr: string): { mainArtist: string; artists: string[] } {
    if (!artistStr) return { mainArtist: 'Unknown Artist', artists: [] };
    const cleanStr = artistStr.normalize('NFC').trim();

    const tokens = cleanStr
      .split(/(?:\s+(?:feat\.?|ft\.?|featuring)\s+)|(?:\s+[xX&,]\s+)|(?:\s*,\s*)/i)
      .map((a) => a.trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      return { mainArtist: cleanStr || 'Unknown Artist', artists: [cleanStr || 'Unknown Artist'] };
    }

    return {
      mainArtist: tokens[0] || 'Unknown Artist',
      artists: tokens,
    };
  },

  /**
   * Làm sạch toàn diện metadata từ dữ liệu trích xuất của YouTube
   */
  clean(raw: {
    title: string;
    uploader?: string;
    channel?: string;
    artist?: string;
    track?: string;
    album?: string;
  }): CleanedMetadata {
    // 1. Ưu tiên dữ liệu YouTube Music chính thống nếu có cả track và artist
    if (raw.track && raw.artist) {
      const { mainArtist, artists } = this.parseArtists(raw.artist);
      return {
        title: this.toSafeTitleCase(raw.track.normalize('NFC').trim()),
        artist: mainArtist,
        albumArtist: mainArtist,
        artists,
        album: raw.album ? raw.album.normalize('NFC').trim() : undefined,
        confidence: 'high',
        confidenceReason: 'Khớp dữ liệu chuẩn từ YouTube Music',
        source: 'yt-music',
      };
    }

    // 2. Làm sạch tiêu đề video thông thường bằng Regex
    let cleanTitle = raw.title.normalize('NFC');
    for (const pattern of JUNK_PATTERNS) {
      cleanTitle = cleanTitle.replace(pattern, ' ');
    }
    // Cắt đuôi phân cách | nếu sau nó là các tag audio/kênh
    cleanTitle = cleanTitle.replace(/\s*\|\s*(?:@?\d+\s*hz|8d|slowed|remaster|bass|audio|official).*$/i, '');
    cleanTitle = cleanTitle.replace(/\s{2,}/g, ' ').replace(/^\s*[|-]\s*/, '').replace(/\s*[|-]\s*$/, '').trim();

    // Nhận diện định dạng 'Artist - Title'
    const dashMatch = cleanTitle.match(/^([^-]+)\s*-\s*(.+)$/);
    if (dashMatch && dashMatch[1] && dashMatch[2]) {
      const rawArtist = dashMatch[1].trim();
      let rawTitle = dashMatch[2].trim();

      // Nếu rawTitle vẫn còn chứa pipe tag '| ...', cắt bỏ
      rawTitle = rawTitle.replace(/\s*\|\s*.*$/, '').trim();

      const { mainArtist, artists } = this.parseArtists(rawArtist);

      // Tách 'ft.' hoặc 'feat.' ra khỏi tên bài hát nếu có
      let finalTitle = rawTitle;
      const featMatch = rawTitle.match(/^(.*?)(?:\s+(?:feat\.?|ft\.?|featuring)\s+(.*))$/i);
      if (featMatch && featMatch[1] && featMatch[2]) {
        finalTitle = featMatch[1].trim();
        const extraArtists = this.parseArtists(featMatch[2].trim()).artists;
        for (const ea of extraArtists) {
          if (!artists.includes(ea)) {
            artists.push(ea);
          }
        }
      }

      return {
        title: this.toSafeTitleCase(finalTitle),
        artist: mainArtist,
        albumArtist: mainArtist,
        artists,
        album: raw.album?.trim() || undefined,
        confidence: 'high',
        confidenceReason: 'Phân tách chuẩn xác theo cấu trúc Nghệ sĩ - Tên bài hát',
        source: 'regex',
      };
    }

    // 3. Fallback: Dùng tên kênh làm nghệ sĩ
    const fallbackArtist = this.normalizeChannelName(raw.artist || raw.channel || raw.uploader);
    const { mainArtist, artists } = this.parseArtists(fallbackArtist);

    let fallbackTitle = cleanTitle.replace(/\s*\|\s*.*$/, '').trim();
    const featMatch = fallbackTitle.match(/^(.*?)(?:\s+(?:feat\.?|ft\.?|featuring)\s+(.*))$/i);
    if (featMatch && featMatch[1] && featMatch[2]) {
      fallbackTitle = featMatch[1].trim();
      const extraArtists = this.parseArtists(featMatch[2].trim()).artists;
      for (const ea of extraArtists) {
        if (!artists.includes(ea)) {
          artists.push(ea);
        }
      }
    }

    return {
      title: this.toSafeTitleCase(fallbackTitle) || 'Unknown Title',
      artist: mainArtist,
      albumArtist: mainArtist,
      artists,
      album: raw.album?.trim() || undefined,
      confidence: 'medium',
      confidenceReason: 'Sử dụng tên kênh làm nghệ sĩ',
      source: 'regex',
    };
  },
};
