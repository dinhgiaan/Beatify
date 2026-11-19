import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import type { Album } from '@music-app/shared';
import { colors, spacing, radius, typography } from '../../theme';
import { DiscIcon } from '../icons/SvgIcons';
import { PressableScale } from '../common/PressableScale';
import { haptics } from '../../lib/haptics';

export const DEFAULT_ALBUM_CARD_WIDTH = 104;

export interface AlbumCardProps {
  album: Album;
  cardWidth?: number;
  coverUri?: string;
  onPress: (album: Album) => void;
}

export const AlbumCard = React.memo(function AlbumCard({
  album,
  cardWidth = DEFAULT_ALBUM_CARD_WIDTH,
  coverUri,
  onPress,
}: AlbumCardProps) {
  const handlePress = useCallback(() => {
    haptics.tap();
    onPress(album);
  }, [onPress, album]);

  const effectiveCover = coverUri || album.cover;

  return (
    <PressableScale
      style={[styles.container, { width: cardWidth }]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Album ${album.title}, ${album.artist}`}
    >
      <View style={[styles.coverWrapper, { width: cardWidth, height: cardWidth }]}>
        {effectiveCover ? (
          <Image
            source={{ uri: effectiveCover }}
            style={styles.coverImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            recyclingKey={album.id}
          />
        ) : (
          <View style={styles.coverPlaceholder}>
            <DiscIcon size={Math.round(cardWidth * 0.35)} color={colors.borderLight} />
          </View>
        )}
      </View>

      <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
        {album.title}
      </Text>
      <Text style={styles.artist} numberOfLines={1} ellipsizeMode="tail">
        {album.artist}
      </Text>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  container: {
    marginRight: spacing.md,
  },
  coverWrapper: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  title: {
    ...typography.subheadline,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  artist: {
    ...typography.caption1,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
