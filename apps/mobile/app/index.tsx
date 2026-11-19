import React from 'react';
import { Redirect } from 'expo-router';

/**
 * Điểm vào ứng dụng Beatify Mobile
 * Tự động chuyển hướng thẳng vào Tab Trang chủ mới (Home screen).
 */
export default function IndexScreen() {
  return <Redirect href="/(tabs)/home" />;
}
