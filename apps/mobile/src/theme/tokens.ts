import { StyleSheet } from 'react-native';

/**
 * Design Tokens Beatify - Phong cách Tối giản Apple pha Hip-hop
 * Tối, sâu, typography chuẩn Apple Settings, không dùng viền/icon thừa.
 */
export const tokens = {
  colors: {
    // Nền tối 2 mức surface kiểu iOS Settings Dark Mode
    bgBase: '#000000',
    bgSurface: '#121217',
    bgElevated: '#1c1c22',
    bgOverlay: 'rgba(0, 0, 0, 0.75)',
    bgHighlight: 'rgba(255, 255, 255, 0.05)',
    bgActive: 'rgba(255, 255, 255, 0.1)',

    // Đường phân cách Hairline mờ giữa các dòng kiểu iOS
    separator: 'rgba(255, 255, 255, 0.08)',
    separatorOpaque: '#23232a',

    // Typography phân cấp rõ ràng
    textPrimary: '#ffffff',
    textSecondary: '#a1a1aa',
    textTertiary: '#71717a',
    textMuted: '#71717a',
    textDim: '#52525b',

    // Điểm nhấn & Trạng thái (chỉ dùng cho switch on, nút chính, item đang chọn)
    accent: '#1DB954',
    accentLight: '#22c55e',
    accentMuted: 'rgba(29, 185, 84, 0.16)',

    // Cảnh báo & Nguy hiểm (đỏ nhạt Apple)
    danger: '#f87171',
    dangerMuted: 'rgba(248, 113, 113, 0.15)',
    dangerBorder: 'rgba(248, 113, 113, 0.3)',
    warning: '#fbbf24',

    // Grabber / Drag indicator
    grabber: 'rgba(255, 255, 255, 0.28)',
  },

  typography: {
      largeTitle: {
        fontSize: 34,
        fontWeight: '700' as const,
        letterSpacing: -0.5,
        color: '#ffffff',
      },
      screenTitle: {
        fontSize: 28,
        fontWeight: '700' as const,
        letterSpacing: -0.4,
        color: '#ffffff',
      },
      heroTitle: {
        fontSize: 22,
        fontWeight: '700' as const,
        letterSpacing: -0.3,
        color: '#ffffff',
      },
      title3: {
        fontSize: 20,
        fontWeight: '600' as const,
        letterSpacing: -0.2,
        color: '#ffffff',
      },
      headline: {
        fontSize: 17,
        fontWeight: '600' as const,
        letterSpacing: -0.2,
        color: '#ffffff',
      },
      body: {
        fontSize: 16,
        fontWeight: '400' as const,
        letterSpacing: -0.1,
        color: '#ffffff',
      },
      subheadline: {
        fontSize: 15,
        fontWeight: '400' as const,
        color: '#a1a1aa',
      },
      footnote: {
        fontSize: 13,
        fontWeight: '400' as const,
        color: '#71717a',
      },
      caption: {
        fontSize: 12,
        fontWeight: '500' as const,
        color: '#71717a',
      },
      sectionHeader: {
        fontSize: 13,
        fontWeight: '500' as const,
        letterSpacing: 0.3,
        textTransform: 'uppercase' as const,
        color: '#71717a',
      },
      // Giữ tương thích ngược với các component cũ
      sectionTitle: {
        fontSize: 20,
        fontWeight: '800' as const,
        letterSpacing: -0.3,
        color: '#ffffff',
      },
      trackTitle: {
        fontSize: 17,
        fontWeight: '600' as const,
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
      cover: 10,
      sheet: 20,
      card: 14,
      button: 9999,
      pill: 9999,
      avatar: 9999,
    },

    spacing: {
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 20,
      xxl: 24,
      sheetPadding: 16,
      rowHeight: 48,
      minTouchTarget: 44,
    },

    hairlineWidth: StyleSheet.hairlineWidth,
  } as const;
