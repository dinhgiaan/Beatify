import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { tokens } from '../../src/theme/tokens';
import { triggerSelectionHaptic } from '../../src/utils/haptics';

export default function SettingsLayout() {
  const router = useRouter();

  const handleClose = () => {
    triggerSelectionHaptic();
    router.back();
  };

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: tokens.colors.bgBase,
        },
        headerTintColor: tokens.colors.textPrimary,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 17,
        },
        headerLargeTitleStyle: {
          fontWeight: '800',
          color: tokens.colors.textPrimary,
        },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: {
          backgroundColor: tokens.colors.bgBase,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Cài đặt & Hồ sơ',
          headerLargeTitle: true,
          headerRight: () => (
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.doneBtn}
            >
              <Text style={styles.doneBtnText}>Xong</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name="profile"
        options={{
          title: 'Hồ sơ',
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="replay"
        options={{
          title: 'Thống kê Replay',
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="playback"
        options={{
          title: 'Phát nhạc',
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="storage"
        options={{
          title: 'Lưu trữ & Lịch sử',
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="advanced"
        options={{
          title: 'Nâng cao',
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="transition-logs"
        options={{
          title: 'Nhật ký chuyển bài',
          headerLargeTitle: true,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  doneBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  doneBtnText: {
    ...tokens.typography.body,
    fontSize: 17,
    fontWeight: '600',
    color: tokens.colors.accent,
  },
});

