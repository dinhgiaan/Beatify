/**
 * Design Tokens Beatify - Phong cách Tối giản Apple pha Hip-hop
 * Tối, sâu, typography đậm nét, không dùng viền/icon thừa.
 */
export const tokens = {
  colors: {
    // Nền sâu gần đen kiểu Apple Music / SoundCloud
    bgBase: '#08080a',
    bgSurface: '#0e0e12',
    bgElevated: '#15151a',
    bgOverlay: 'rgba(0, 0, 0, 0.65)',
    bgHighlight: 'rgba(255, 255, 255, 0.06)',
    bgActive: 'rgba(255, 255, 255, 0.1)',

    // Typography
    textPrimary: '#ffffff',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    textDim: '#52525b',

    // Điểm nhấn & Trạng thái
    accent: '#1DB954',
    accentLight: '#22c55e',
    accentMuted: 'rgba(29, 185, 84, 0.16)',

    // Cảnh báo & Nguy hiểm (đỏ nhạt Apple)
    danger: '#f87171',
    dangerMuted: 'rgba(248, 113, 113, 0.15)',
    warning: '#fbbf24',

    // Grabber
    grabber: 'rgba(255, 255, 255, 0.25)',
  },

  typography: {
    screenTitle: {
      fontSize: 38,
      fontWeight: '800' as const,
      letterSpacing: -0.5,
      color: '#ffffff',
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '700' as const,
      letterSpacing: -0.3,
      color: '#ffffff',
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '800' as const,
      letterSpacing: -0.3,
      color: '#ffffff',
    },
    trackTitle: {
      fontSize: 17,
      fontWeight: '700' as const,
      color: '#ffffff',
    },
    trackSubtitle: {
      fontSize: 14,
      fontWeight: '400' as const,
      color: '#a1a1aa',
    },
    actionLabel: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: '#ffffff',
    },
    actionSecondary: {
      fontSize: 14,
      fontWeight: '500' as const,
      color: '#a1a1aa',
    },
    badge: {
      fontSize: 12,
      fontWeight: '600' as const,
    },
  },

  radius: {
    cover: 12,
    sheet: 28,
    button: 9999,
    card: 16,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    sheetPadding: 20,
    rowHeight: 52,
  },
} as const;

