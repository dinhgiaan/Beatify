import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import type { HomeArtistItem } from '@music-app/shared';
import { colors, spacing, fontWeights } from '../../theme';
import { DiscIcon } from '../icons/SvgIcons';
import { haptics } from '../../lib/haptics';
import { PressableScale } from '../common/PressableScale';

export const ARTIST_CHIP_WIDTH = 90;

export interface ArtistChipProps {
  artist: HomeArtistItem;
  onPress: (artist: HomeArtistItem) => void;
  cardWidth?: number;
}

export const ArtistChip = React.memo(function ArtistChip({
  artist,
  onPress,
  cardWidth = ARTIST_CHIP_WIDTH,
}: ArtistChipProps) {
  const handlePress = useCallback(() => {
    haptics.tap();
    onPress(artist);
  }, [onPress, artist]);

  const avatarSize = Math.max(64, cardWidth - 10);

  return (
    <PressableScale
      style={[styles.container, { width: cardWidth }]}
      onPress={handlePress}
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityLabel={`Nghệ sĩ ${artist.artist}, ${artist.trackCount} bài hát`}
    >
      <View
        style={[
          styles.avatarWrapper,
          { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
        ]}
      >
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
            <DiscIcon size={Math.round(avatarSize * 0.4)} color={colors.borderLight} />
          </View>
        )}
      </View>

      <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
        {artist.artist}
      </Text>
      <Text style={styles.subtext} numberOfLines={1}>
        {artist.trackCount} bài
      </Text>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarWrapper: {
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
    fontSize: 13,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    textAlign: 'center',
    width: '100%',
  },
  subtext: {
    fontSize: 12,
    fontWeight: fontWeights.regular,
    color: colors.textSecondary,
    marginTop: 1,
    textAlign: 'center',
  },
});
