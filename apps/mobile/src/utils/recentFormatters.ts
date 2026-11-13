/**
 * Tiện ích định dạng và làm sạch văn bản cho danh sách Nghe gần đây và Thống kê
 */

/**
 * Lược bỏ các phần rác/thừa từ YouTube trong tên bài hát để hiển thị kiểu poster tối giản Apple:
 * Ví dụ:
 * - "[MV OFFICIAL] Buông Đôi Tay Nhau Ra" -> "Buông Đôi Tay Nhau Ra"
 * - "NOLOVENOLIFE (prod. by Kewtiie)" -> "NOLOVENOLIFE"
 * - "Bài Hát Hay Nhất - Video Lyrics" -> "Bài Hát Hay Nhất"
 * - "Đừng Làm Trái Tim Anh Đau (Official Video)" -> "Đừng Làm Trái Tim Anh Đau"
 * - "Cắt Đôi Nỗi Sầu | Review" -> "Cắt Đôi Nỗi Sầu"
 */
export function cleanTrackTitle(title: string): string {
  if (!title) return '';

  let cleaned = title;

  // 1. Lược bỏ các tiền tố/hậu tố trong ngoặc vuông: [MV ...], [OFFICIAL ...], [LYRICS ...], [Track X. ...]
  cleaned = cleaned.replace(/\[(?:MV|OFFICIAL|LYRIC|LYRICS|AUDIO|TEASER|VIDEO|TRACK\s*\d+|4K|HD|REMIX|COVER|VIETSUB)[^\]]*\]/gi, '').trim();

  // 2. Lược bỏ "Track X. " nếu còn sót ở đầu
  cleaned = cleaned.replace(/^Track\s*\d+[.\s-]+/gi, '').trim();

  // 3. Lược bỏ trong ngoặc đơn dạng: (prod. by ...), (Official Video), (Lyrics Video), (Audio), (Review), (Reaction)
  cleaned = cleaned.replace(/\((?:prod\.?\s*by|official(?:\s+music)?\s+video|official(?:\s+audio)?|video\s+lyrics|lyrics?(?:\s+video)?|audio|mv|visualizer|review|reaction|remix|cover|vietsub|live)[^)]*\)/gi, '');

  // 4. Lược bỏ các hậu tố nối bằng gạch ngang, gạch đứng: " - MV OFFICIAL", " | Video Lyrics", " - Review", " | Official Video"
  cleaned = cleaned.replace(/\s*[-–—|]\s*(?:MV(?:\s+OFFICIAL)?|OFFICIAL(?:\s+MUSIC)?\s+VIDEO|OFFICIAL\s+AUDIO|VIDEO\s+LYRICS|LYRICS?(?:\s+VIDEO)?|AUDIO|MUSIC\s+VIDEO|VISUALIZER|REVIEW|REACTION|LIVE|REMIX|4K|HD).*$/gi, '');

  // 5. Lược bỏ cụm từ rác đứng riêng ở cuối chuỗi: " Video Lyrics", " Official Video" nếu không có dấu gạch
  cleaned = cleaned.replace(/\s+(?:video\s+lyrics|lyrics?\s+video|official\s+video|official\s+audio)\s*$/gi, '');

  // 6. Dọn dẹp khoảng trắng kép và khoảng trắng thừa ở hai đầu
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // 7. Nếu lỡ xoá hết sạch (hiếm khi), fallback về title gốc
  return cleaned.length > 0 ? cleaned : title.trim();
}

/**
 * Định dạng thời gian tương đối bằng tiếng Việt tự nhiên
 * Nếu không có timestamp cụ thể (hoặc undefined), dựa theo thứ tự nghe (index) để gán nhãn
 */
export function formatRelativeTime(
  dateOrTimestamp?: string | number | Date,
  fallbackIndex?: number
): string {
  if (dateOrTimestamp) {
    const time = new Date(dateOrTimestamp).getTime();
    if (!isNaN(time)) {
      const now = Date.now();
      const diffSec = Math.floor((now - time) / 1000);

      if (diffSec < 60) return 'Vừa xong';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} phút trước`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} giờ trước`;
      const diffDay = Math.floor(diffHour / 24);
      if (diffDay === 1) return 'Hôm qua';
      if (diffDay < 7) return `${diffDay} ngày trước`;
      return 'Trước đó';
    }
  }

  // Fallback theo thứ tự nghe gần đây nếu không có timestamp
  if (typeof fallbackIndex === 'number') {
    if (fallbackIndex === 0) return 'Vừa xong';
    if (fallbackIndex <= 2) return 'Hôm nay';
    if (fallbackIndex <= 5) return 'Hôm qua';
    return 'Trước đó';
  }

  return 'Gần đây';
}
