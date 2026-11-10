import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fontSizes, fontWeights, spacing, radius } from '../src/theme';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Không tìm thấy trang</Text>
      <Text style={styles.desc}>Đường dẫn không tồn tại hoặc đã thay đổi.</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => router.replace('/(tabs)/library')}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>Quay lại Thư viện</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    fontSize: fontSizes.titleLarge,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  desc: {
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  buttonText: {
    color: colors.textDark,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
});
