import React from 'react';
import { Redirect } from 'expo-router';

/**
 * Điểm vào ứng dụng Beatify Mobile (Thiết kế lại Pha 3)
 * Tự động chuyển hướng thẳng vào Tab Thư viện (Zero-Settings UI).
 * Toàn bộ cấu hình và đồng bộ được quản lý tự động ngầm qua deep link và Web Dashboard.
 */
export default function IndexScreen() {
  return <Redirect href="/(tabs)/library" />;
}
