import type { TextStyle } from 'react-native';

/**
 * Thang kích thước chữ và chiều cao dòng
 */
export const fontSizes = {
  micro: 10,       // Dùng thay thế 9.5
  caption: 11,     // Dùng thay thế 10.5, 11
  captionLarge: 12,
  subhead: 13,
  body: 14,
  callout: 15,
  subheading: 16,
  titleSmall: 17,
  title: 18,
  titleLarge: 20,
  headline: 24,
  display: 26,
  huge: 32,
} as const;

export const lineHeights = {
  micro: 14,
  caption: 15,
  captionLarge: 16,
  subhead: 18,
  body: 20,
  callout: 21,
  subheading: 22,
  titleSmall: 23,
  title: 24,
  titleLarge: 28,
  headline: 30,
  display: 36,
  huge: 40,
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

/**
 * Kiểu chữ tạo sẵn (Typography Presets)
 */
export const typography: Record<string, TextStyle> = {
  micro: {
    fontSize: fontSizes.micro,
    lineHeight: lineHeights.micro,
    fontWeight: fontWeights.bold,
  },
  caption: {
    fontSize: fontSizes.caption,
    lineHeight: lineHeights.caption,
    fontWeight: fontWeights.semibold,
  },
  captionRegular: {
    fontSize: fontSizes.captionLarge,
    lineHeight: lineHeights.captionLarge,
    fontWeight: fontWeights.regular,
  },
  captionMedium: {
    fontSize: fontSizes.captionLarge,
    lineHeight: lineHeights.captionLarge,
    fontWeight: fontWeights.medium,
  },
  captionBold: {
    fontSize: fontSizes.captionLarge,
    lineHeight: lineHeights.captionLarge,
    fontWeight: fontWeights.bold,
  },
  subhead: {
    fontSize: fontSizes.subhead,
    lineHeight: lineHeights.subhead,
    fontWeight: fontWeights.semibold,
  },
  body: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.regular,
  },
  bodyMedium: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.medium,
  },
  bodyStrong: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.bold,
  },
  callout: {
    fontSize: fontSizes.callout,
    lineHeight: lineHeights.callout,
    fontWeight: fontWeights.semibold,
  },
  subheading: {
    fontSize: fontSizes.subheading,
    lineHeight: lineHeights.subheading,
    fontWeight: fontWeights.semibold,
  },
  title: {
    fontSize: fontSizes.title,
    lineHeight: lineHeights.title,
    fontWeight: fontWeights.bold,
  },
  titleLarge: {
    fontSize: fontSizes.titleLarge,
    lineHeight: lineHeights.titleLarge,
    fontWeight: fontWeights.bold,
  },
  headline: {
    fontSize: fontSizes.headline,
    lineHeight: lineHeights.headline,
    fontWeight: fontWeights.bold,
  },
  display: {
    fontSize: fontSizes.display,
    lineHeight: lineHeights.display,
    fontWeight: fontWeights.extrabold,
  },
};
