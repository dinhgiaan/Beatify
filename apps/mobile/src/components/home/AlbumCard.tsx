import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import type { Album } from '@music-app/shared';
import { colors, spacing, radius, typography } from '../../theme';
import { DiscIcon } from '../icons/SvgIcons';
import { haptics } from '../../lib/haptics';

export const ALBUM_CARD_WIDTH = 140;

export interface AlbumCardProps {
  album: Album;
  coverUri?: string;
  onPress: (album: Album) => void;
}

export const AlbumCard = React.memo(function AlbumCard({
  album,
  coverUri,
  onPress,
}: AlbumCardProps) {
  const handlePress = useCallback(() => {
    haptics.tap();
    onPress(album);
  }, [onPress, album]);

  const effectiveCover = coverUri || album.cover;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Album ${album.title}, ${album.artist}`}
    >
      <View style={styles.coverWrapper}>
          {
            effectiveCover?(
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
          <DiscIcon size={36} color={colors.borderLight} />
        </View>
        )}
      </View>

      <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
        {album.title}
      </Text>
      <Text style={styles.artist} numberOfLines={1} ellipsizeMode="tail">
        {album.artist}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    width: ALBUM_CARD_WIDTH,
    marginRight: spacing.md,
  },
  coverWrapper: {
    width: ALBUM_CARD_WIDTH,
    height: ALBUM_CARD_WIDTH,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
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
    ...typography.subheadline,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.xs + 2,
  },
  artist: {
    ...typography.caption1,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

