import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import type { Album } from '@music-app/shared';
import { colors, spacing, radius, fontWeights } from '../../theme';
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

function areAlbumCardPropsEqual(prev: AlbumCardProps, next: AlbumCardProps): boolean {
  return (
    prev.album.id === next.album.id &&
    prev.cardWidth === next.cardWidth &&
    prev.coverUri === next.coverUri &&
    prev.album.title === next.album.title &&
    prev.album.artist === next.album.artist
  );
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
      scaleTo={0.96}
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
}, areAlbumCardPropsEqual);

const styles = StyleSheet.create({
  container: {
    marginRight: spacing.md,
  },
  coverWrapper: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.borderLight,
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
    fontSize: 13, // E2: tên album 13pt/600
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  artist: {
    fontSize: 12, // E2: nghệ sĩ 12pt/400
    fontWeight: fontWeights.regular,
    color: colors.textTertiary, // E1: màu xám dịu
    marginTop: 2,
  },
});
