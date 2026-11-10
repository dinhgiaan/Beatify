/**
 * Bảng màu Design Token chuẩn ngữ nghĩa cho Beatify Mobile
 * Gom toàn bộ mã hex và rgba từ các màn hình hiện tại.
 * Giữ nguyên giá trị màu sắc, chỉ đặt tên theo vai trò để giao diện không đổi.
 */
export const colors = {
  // 1. Nền chính (Backgrounds)
  background: '#0a0a0a',
  backgroundElevated: '#121212',
  backgroundSecondary: '#141414',
  surface: '#181818',
  surfaceSubtle: '#1a1a1a',
  surfaceElevated: '#222222',
  surfaceHighlight: '#262626',
  surfaceCardBorder: '#282828',
  surfaceSecondary: '#27272a',
  surfaceActive: '#242424',
  surfacePressed: '#202020',
  surfaceMuted: '#1f1f1f',
  surfaceControl: '#1c1c1c',
  surfaceDarker: '#161616',

  // Nền các màn hình và modal đặc thù
  lyricsBackground: '#0a0b0e',
  playlistBackground: '#0c0d0e',
  playlistCard: '#15171b',
  playlistCardElevated: '#16181d',
  playlistCardActive: '#16281c',
  playlistFavActive: '#261217',
  playlistIconBg: '#16221a',
  playlistActionBg: '#181b20',
  playlistBtnBg: '#1b1d22',
  playlistPlayBtnBg: '#22262e',
  mysteryBackground: '#161618',
  mysteryBanner: '#1b1b1f',
  mysteryBadgeBg: '#242426',
  tabItemActiveBg: '#2c2c2c',

  // 2. Màu thương hiệu / Điểm nhấn (Spotify Green)
  primary: '#1DB954',
  primaryMuted: 'rgba(29, 185, 84, 0.15)',
  primaryMutedLight: 'rgba(29, 185, 84, 0.12)',
  primaryBorder: 'rgba(29, 185, 84, 0.4)',
  primaryDark: '#1e3825',
  primaryDarker: '#1e4828',
  primaryLight: '#22c55e',

  // 3. Màu chữ (Typography)
  textPrimary: '#ffffff',
  textSecondary: '#d4d4d8',
  textSecondaryAlt: '#cccccc',
  textMuted: '#a1a1aa',
  textMutedAlt: '#a0a0a0',
  textSubtle: '#888888',
  textTertiary: '#71717a',
  textDisabled: '#666666',
  textDarker: '#555555',
  textDark: '#000000',
  textGray300: '#d1d5db',
  textGray400: '#9ca3af',
  textGray500: '#6b7280',
  textMedium: '#b3b3b3',
  textDim: '#777777',
  textPlaceholder: '#666666',

  // Màu chữ alpha trong suốt
  textWhite85: 'rgba(255, 255, 255, 0.85)',
  textWhite75: 'rgba(255, 255, 255, 0.75)',
  textWhite45: 'rgba(255, 255, 255, 0.45)',
  textWhite40: 'rgba(255, 255, 255, 0.4)',
  textWhite28: 'rgba(255, 255, 255, 0.28)',

  // 4. Đường viền (Borders)
  border: '#282828',
  borderSubtle: '#222222',
  borderLight: '#333333',
  borderMuted: '#2a2a2a',
  borderNeutral: '#262626',
  borderDark: '#1c1c1c',
  borderSecondary: '#3f3f46',
  borderDivider: '#2e2e2e',
  borderPlaylist: '#22252a',
  borderPlaylistDialog: '#262930',
  borderPlaylistFav: '#4d1e28',
  borderCheck: '#444852',

  // 5. Trạng thái chức năng (Status & Functional)
  danger: '#ef4444',
  dangerIcon: '#ff4444',
  dangerLight: '#f87171',
  dangerSoft: '#ff6b6b',
  dangerBg: 'rgba(239, 68, 68, 0.1)',
  dangerBgMuted: 'rgba(239, 68, 68, 0.15)',
  dangerBorder: 'rgba(239, 68, 68, 0.4)',
  dangerDark: '#7f1d1d',

  favorite: '#f43f5e',
  favoriteActive: '#f43f5e',

  warning: '#eab308',
  warningMuted: 'rgba(234, 179, 8, 0.12)',
  warningBorder: 'rgba(234, 179, 8, 0.3)',

  gold: '#ffd700',
  orange: '#ff7700',

  // 6. Lớp phủ & Hiệu ứng (Overlays & Scrims)
  overlay: 'rgba(0, 0, 0, 0.75)',
  overlayLight: 'rgba(0, 0, 0, 0.7)',
  white5: 'rgba(255, 255, 255, 0.05)',
  white8: 'rgba(255, 255, 255, 0.08)',
  white22: 'rgba(255, 255, 255, 0.22)',
  white35: 'rgba(255, 255, 255, 0.35)',
} as const;

export type ColorToken = keyof typeof colors;

