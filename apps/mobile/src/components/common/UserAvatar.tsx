import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';
import { ProfileIcon } from '../icons/SvgIcons';

export interface UserAvatarProps {
  avatarUri?: string | null;
  displayName?: string | null;
  size?: number;
  fontSize?: number;
}

/**
 * Trích xuất 1-2 chữ cái viết hoa đại diện cho người dùng
 * Ví dụ: "Đinh Gia An" -> "GA", "Beatify User" -> "BU", "Sơn" -> "S"
 */
export function getInitials(name?: string | null): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const firstWord = parts[0];
  if (parts.length === 1 && firstWord) {
    return firstWord.slice(0, 2).toUpperCase();
  }
  const first = parts[0]?.[0] || '';
  const last = parts[parts.length - 1]?.[0] || '';
  return (first + last).toUpperCase();
}

export function UserAvatar({
  avatarUri,
  displayName,
  size = 48,
  fontSize,
}: UserAvatarProps) {
  const calculatedFontSize = fontSize ?? Math.round(size * 0.4);
  const initials = getInitials(displayName);

  if (avatarUri) {
    return (
      <View style={[styles.avatarBase, { width: size, height: size, borderRadius: size / 2 }]}>
        <Image
          source={{ uri: avatarUri }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.avatarBase,
        styles.initialsBox,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {initials ? (
        <Text
          style={[
            styles.initialsText,
            { fontSize: calculatedFontSize, lineHeight: calculatedFontSize * 1.2 },
          ]}
          numberOfLines={1}
        >
          {initials}
        </Text>
      ) : (
        <ProfileIcon size={Math.round(size * 0.52)} color={tokens.colors.textSecondary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarBase: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: tokens.hairlineWidth,
    borderColor: tokens.colors.separator,
  },
  image: {
    backgroundColor: tokens.colors.bgElevated,
  },
  initialsBox: {
    backgroundColor: tokens.colors.bgElevated,
  },
  initialsText: {
    fontWeight: '700',
    color: tokens.colors.textPrimary,
    letterSpacing: -0.2,
  },
});
