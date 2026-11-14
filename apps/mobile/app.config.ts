import type { ExpoConfig } from 'expo/config';

const IS_DEV = process.env.APP_VARIANT === 'development';

const config: ExpoConfig = {
  name: IS_DEV ? 'Beatify Dev' : 'Beatify',
  slug: 'music-app',
  scheme: 'beatify',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  ios: {
    supportsTablet: false,
    bundleIdentifier: IS_DEV ? 'com.dinhgiaan.beatify.dev' : 'com.dinhgiaan.beatify',
    infoPlist: {
      UIBackgroundModes: ['audio'],
      NSPhotoLibraryUsageDescription: 'Beatify cần quyền truy cập thư viện ảnh để bạn chọn ảnh đại diện.',
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-image-picker',
      {
        photosPermission: 'Beatify cần quyền truy cập thư viện ảnh để bạn chọn ảnh đại diện.',
      },
    ],
  ],
};

export default config;
