import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color?: string;
  fill?: string;
  style?: object;
}

// 1. Play Icon (Tam giác chuẩn Spotify / Apple Music)
export function PlayIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.28-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z"
        fill={color}
      />
    </Svg>
  );
}

// 2. Pause Icon (Hai thanh đứng bo tròn chuẩn Spotify / Apple Music)
export function PauseIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="6" y="5" width="4" height="14" rx="1.5" fill={color} />
      <Rect x="14" y="5" width="4" height="14" rx="1.5" fill={color} />
    </Svg>
  );
}

// 3. Next Icon (Bỏ qua bài kế tiếp - vector tam giác + thanh chặn chuẩn SF Symbols)
export function NextIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4.5v15a1 1 0 0 0 1.55.83l10-7.5a1 1 0 0 0 0-1.66l-10-7.5A1 1 0 0 0 5 4.5zM18 4a1 1 0 0 1 1 1v14a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1z"
        fill={color}
      />
    </Svg>
  );
}

// 4. Prev Icon (Phát lại từ đầu / Bài trước - vector thanh chặn + tam giác chuẩn SF Symbols)
export function PrevIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 4.5v15a1 1 0 0 1-1.55.83l-10-7.5a1 1 0 0 1 0-1.66l10-7.5A1 1 0 0 1 19 4.5zM6 4a1 1 0 0 0-1 1v14a1 1 0 1 0 2 0V5a1 1 0 0 0-1-1z"
        fill={color}
      />
    </Svg>
  );
}

// 5. Seek Backward 5s (Vòng cung tua lại 5 giây)
export function SeekBackwardIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12.5 4.5A7.5 7.5 0 1 0 20 12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Path
        d="M10 2L13 4.5L10 7"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Số 5 tối giản ở tâm */}
      <Path
        d="M10.5 10.5h3v1.5h-3v2h3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// 6. Seek Forward 5s (Vòng cung tua đi 5 giây phong cách Apple Podcasts)
export function SeekForwardIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11.5 4.5A7.5 7.5 0 1 1 4 12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Path
        d="M14 2L11 4.5L14 7"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Số 5 tối giản ở tâm */}
      <Path
        d="M10.5 10.5h3v1.5h-3v2h3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// 7. Shuffle Icon (Trộn bài - 2 mũi tên đan chéo chuẩn Spotify / SF Symbols)
export function ShuffleIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 4h4v4M4 20l7.5-7.5M20 4l-8.5 8.5M4 4l5 5M16 20h4v-4M20 20l-5-5"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 8. Repeat Icon (Vòng lặp danh sách - chuẩn Spotify / Apple Music)
export function RepeatIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 9. Repeat One Icon (Vòng lặp 1 bài có số 1)
export function RepeatOneIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M11 11.5L12 11v4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 10. Profile User Icon (Hồ sơ người dùng)
export function ProfileIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4.2" stroke={color} strokeWidth="2" />
      <Path
        d="M4.5 19.5c0-3.6 3.4-6.5 7.5-6.5s7.5 2.9 7.5 6.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// 11. Edit Pen Icon (Cây bút chỉnh sửa tối giản)
export function EditIcon({ size = 20, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14.06 3.94a2.5 2.5 0 0 1 3.54 0l2.46 2.46a2.5 2.5 0 0 1 0 3.54l-11.5 11.5a1 1 0 0 1-.45.26l-4.5 1.12a.5.5 0 0 1-.61-.61l1.12-4.5a1 1 0 0 1 .26-.45l11.5-11.5z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 12. Mystery Box / Sparkles Icon (Bài hát bí ẩn)
export function MysteryIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2L14.3 8.7L21 11L14.3 13.3L12 20L9.7 13.3L3 11L9.7 8.7L12 2Z"
        fill={color}
      />
      <Circle cx="19" cy="5" r="1.5" fill={color} />
      <Circle cx="5" cy="18" r="1.5" fill={color} />
    </Svg>
  );
}

// 13. Disc / Vinyl Icon (Đĩa than âm nhạc)
export function DiscIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" />
      <Circle cx="12" cy="12" r="0.8" fill={color} />
    </Svg>
  );
}

// 14. Music Note Icon (Nốt nhạc kép)
export function MusicNoteIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 15. Headphones Icon (Tai nghe)
export function HeadphonesIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a9 9 0 0 1 18 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 16. Star Icon (Ngôi sao yêu thích / Thành tựu)
export function StarIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={color}
      />
    </Svg>
  );
}

// 17. Clock Icon (Thời gian nghe)
export function ClockIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <Path
        d="M12 7v5l3 3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// 18. Moon Icon (Cú đêm âm nhạc)
export function MoonIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        fill={color}
      />
    </Svg>
  );
}

// 19. Trophy Icon (Cúp danh hiệu)
export function TrophyIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M18 9h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3"
        stroke={color}
        strokeWidth="2"
      />
      <Path
        d="M6 3h12v7a6 6 0 0 1-12 0V3zM12 16v5M8 21h8"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// 20. Heart Icon (Trái tim yêu thích - hỗ trợ fill hoặc outline)
export function HeartIcon({ size = 24, color = '#ffffff', fill = 'none' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <Path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={fill}
      />
    </Svg>
  );
}

// 21. Flame Icon (Bài hát xu hướng / Bùng nổ)
export function FlameIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2c1 3.5 3 5 4.5 7.5C18 12 18.5 14 18 16a6.5 6.5 0 0 1-12 0c-.5-2.5.5-5 2-7.5C9 8.5 10 6 12 2z"
        fill={color}
      />
    </Svg>
  );
}

// 22. Close Icon (Dấu X đóng modal)
export function CloseIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 6L6 18M6 6l12 12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// 23. Trash Icon (Thùng rác xóa bài)
export function TrashIcon({ size = 20, color = '#ff4444' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// 24. Volume Min Icon
export function VolumeMinIcon({ size = 20, color = '#888888' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11 5L6 9H2v6h4l5 4V5z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 25. Volume Max Icon
export function VolumeMaxIcon({ size = 20, color = '#888888' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 26. Check Icon (Hoàn thành / Đạt được)
export function CheckIcon({ size = 20, color = '#1DB954' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 6L9 17l-5-5"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 27. Question Icon (Dấu chấm hỏi tối giản cho bài bí ẩn)
export function QuestionIcon({ size = 20, color = '#b3b3b3' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 28. Lyrics Icon (Biểu tượng Cây Micro Karaoke chuẩn Apple Music)
export function LyricsIcon({ size = 20, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"
        stroke={color}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"
        stroke={color}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 30. Plus Icon (Dấu cộng tạo mới)
export function PlusIcon({ size = 20, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 5v14M5 12h14"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 31. Playlist Icon (Danh sách phát)
export function PlaylistIcon({ size = 20, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 6h16M4 12h10M4 18h7M16 15l5 3-5 3v-6z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 32. Library Icon (Thư viện âm nhạc - Your Library style chuẩn hiện đại)
export function LibraryIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 7.5L8.5 20"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M13 4.5V20"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18.5 4.5V20"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 33. Search Icon (Kính lúp tìm kiếm)
export function SearchIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth="2" />
      <Path
        d="M20 20l-4-4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// 34. Queue Icon (Hàng đợi bài hát)
export function QueueIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 6h16M4 12h10M4 18h10M17 15l4 3-4 3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 35. Chevron Down Icon (Mũi tên xuống thu nhỏ modal)
export function ChevronDownIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9l6 6 6-6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Chevron Right Icon (Mũi tên sang phải cho nút Xem tất cả / Điều hướng)
export function ChevronRightIcon({ size = 20, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18l6-6-6-6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Settings Gear Icon (Bánh răng Cài đặt nhanh)
export function SettingsGearIcon({ size = 22, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Chevron Up Icon (Mũi tên lên cuộn về đầu trang không chân)
export function ChevronUpIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 15l-6-6-6 6"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Arrow Up Icon (Mũi tên lên có cả chân mũi tên chuẩn Apple SF Symbols / Lucide)
export function ArrowUpIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 19V5M5 12l7-7 7 7"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 36. Download Icon (Tải bài hát về máy / Nghe offline)
export function DownloadIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 37. Camera Icon (Đổi ảnh đại diện từ iPhone - phong cách Apple SF Symbols)
export function CameraIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="13" r="4" stroke={color} strokeWidth="2" />
    </Svg>
  );
}

// 38. Clock Rewind / History Icon (Tab Vừa nghe gần đây - SF Symbols style)
export function ClockRewindIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3 3v5h5M12 7v5l4 2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 39. More Horizontal Icon (Nút 3 chấm thao tác bài hát - SF Symbols style)
export function MoreHorizontalIcon({ size = 20, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="1.8" fill={color} />
      <Circle cx="19" cy="12" r="1.8" fill={color} />
      <Circle cx="5" cy="12" r="1.8" fill={color} />
    </Svg>
  );
}

// 40. Home Icon (Biểu tượng Trang chủ phong cách Spotify / Apple Music)
export function HomeIcon({ size = 24, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5z"
        stroke={color}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 41. Cloud Sync / Hot Reload R2 Icon (Biểu tượng xoay / đồng bộ đám mây)
export function CloudSyncIcon({ size = 20, color = '#ffffff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21.5 15a4.5 4.5 0 0 1-4.5 4.5H6.5A5.5 5.5 0 0 1 6 8.54 7 7 0 0 1 18.3 6.3 4.5 4.5 0 0 1 21.5 15z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 11v6m0-6l-2 2m2-2l2 2"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}




