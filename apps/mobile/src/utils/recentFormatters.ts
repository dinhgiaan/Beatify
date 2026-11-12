/**
 * Tiện ích định dạng và làm sạch văn bản cho danh sách Nghe gần đây
 */

/**
 * Lược bỏ các phần thừa trong tên bài hát để hiển thị kiểu poster tối giản:
 * Ví dụ:
 * - "[MV OFFICIAL] Buông Đôi Tay Nhau Ra" -> "Buông Đôi Tay Nhau Ra"
 * - "NOLOVENOLIFE (prod. by Kewtiie)" -> "NOLOVENOLIFE"
 * - "[Lyrics Video] Track 9. Finale..." -> "Finale..."
 * - "Cao Ốc 20 - MV OFFICIAL" -> "Cao Ốc 20"
 */
export function cleanTrackTitle(title: string): string {
  if (!title) return '';

  let cleaned = title;

  // Lược bỏ các tiền tố/hậu tố trong ngoặc vuông: [MV ...], [OFFICIAL ...], [LYRICS ...], [Track X. ...]
  cleaned = cleaned.replace(/\[(?:MV|OFFICIAL|LYRIC|LYRICS|AUDIO|TEASER|VIDEO|TRACK\s*\d+)[^\]]*\]/gi, '');

  // Lược bỏ hậu tố "Track 9. " nếu còn sót
  cleaned = cleaned.replace(/Track\s*\d+[.\s-]+/gi, '');

  // Lược bỏ trong ngoặc đơn dạng: (prod. by ...), (Official Video), (Lyrics)
  cleaned = cleaned.replace(/\((?:prod\.?\s*by|official|lyric|lyrics|audio|mv)[^)]*\)/gi, '');

  // Lược bỏ các hậu tố nối bằng gạch ngang: " - MV OFFICIAL", " - Official Music Video"
  cleaned = cleaned.replace(/\s*[-–—]\s*(?:MV|OFFICIAL|LYRICS|AUDIO|MUSIC VIDEO).*$/gi, '');

  // Dọn dẹp khoảng trắng kép và khoảng trắng thừa ở hai đầu
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Nếu lỡ xoá hết sạch (hiếm khi), fallback về title gốc
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
