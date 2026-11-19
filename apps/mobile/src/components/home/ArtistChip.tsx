import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import type { HomeArtistItem } from '@music-app/shared';
import { colors, spacing, radius, typography } from '../../theme';
import { DiscIcon } from '../icons/SvgIcons';
import { haptics } from '../../lib/haptics';

export const ARTIST_CHIP_WIDTH = 90;

export interface ArtistChipProps {
  artist: HomeArtistItem;
  onPress: (artist: HomeArtistItem) => void;
}

export const ArtistChip = React.memo(function ArtistChip({
  artist,
  onPress,
}: ArtistChipProps) {
  const handlePress = useCallback(() => {
    haptics.tap();
    onPress(artist);
  }, [onPress, artist]);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Nghệ sĩ ${artist.artist}, ${artist.trackCount} bài hát`}
    >
      <View style={styles.avatarWrapper}>
        {artist.coverUrl ? (
          <Image
            source={{ uri: artist.coverUrl }}
            style={styles.avatarImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            recyclingKey={artist.artist}
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <DiscIcon size={30} color={colors.borderLight} />
          </View>
        )}
      </View>

      <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
        {artist.artist}
      </Text>
      <Text style={styles.subtext} numberOfLines={1}>
        {artist.trackCount} bài
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    width: ARTIST_CHIP_WIDTH,
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarWrapper: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  name: {
    ...typography.caption1,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.xs,
    textAlign: 'center',
    width: '100%',
  },
  subtext: {
    ...typography.caption2,
    color: colors.textSecondary,
    marginTop: 1,
    textAlign: 'center',
  },
});

