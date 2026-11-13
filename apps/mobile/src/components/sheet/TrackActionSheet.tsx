import React, { useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Dimensions,
  Alert,
  Modal,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import type { Track } from '@music-app/shared';
import { tokens } from '../../theme/tokens';
import { MOTION } from '../../lib/motion';
import { haptics } from '../../lib/haptics';
import { useCoverColor } from '../../hooks/useCoverColor';
import { ActionRow, type DownloadStatus } from './ActionRow';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface TrackActionSheetProps {
  visible: boolean;
  onClose: () => void;
  track: Track | null;
  coverUrl?: string | null;
  isFavorite?: boolean;
  downloadStatus?: DownloadStatus;
  downloadProgress?: number; // 0 - 100
  /** Danh sách tên các playlist mà bài đã có trong đó (để hiển thị text phù hợp) */
  playlistNames?: string[];
  onPlayNext?: (track: Track) => void;
  onToggleFavorite?: (track: Track) => void;
  onAddToPlaylist?: (track: Track) => void;
  onDownloadPress?: (track: Track, currentStatus: DownloadStatus) => void;
  onEditInfo?: (track: Track) => void;
  onDeleteFromLibrary?: (track: Track) => void;
}

export const TrackActionSheet: React.FC<TrackActionSheetProps> = ({
  visible,
  onClose,
  track,
  coverUrl,
  isFavorite = false,
  downloadStatus = 'idle',
  downloadProgress,
  playlistNames,
  onPlayNext,
  onToggleFavorite,
  onAddToPlaylist,
  onDownloadPress,
  onEditInfo,
  onDeleteFromLibrary,
}) => {
  const insets = useSafeAreaInsets();
  const coverColor = useCoverColor(coverUrl);

  // Animation values
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  const closeSheet = () => {
    'worklet';
    translateY.value = withTiming(SCREEN_HEIGHT, {
      duration: MOTION.duration.fast + 30,
      easing: MOTION.easing.in,
    }, () => {
      runOnJS(onClose)();
    });
    backdropOpacity.value = withTiming(0, {
      duration: MOTION.duration.fast,
      easing: MOTION.easing.in,
    });
  };

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, MOTION.spring.sheet);
      backdropOpacity.value = withTiming(1, {
        duration: MOTION.duration.normal,
        easing: MOTION.easing.out,
      });
    } else {
      translateY.value = SCREEN_HEIGHT;
      backdropOpacity.value = 0;
    }
  }, [visible, translateY, backdropOpacity]);

  // Gesture vuốt xuống đóng sheet theo ngón tay
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 120 || event.velocityY > 600) {
        closeSheet();
      } else {
        translateY.value = withSpring(0, MOTION.spring.sheet);
      }
    });

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // Định dạng thời lượng mm:ss
  const formatDuration = (sec?: number) => {
    if (!sec || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Xác nhận xóa bài hát khỏi thư viện bằng Alert hệ thống
  const handleDeletePress = () => {
    if (!track) return;
    Alert.alert(
      `Xóa "${track.title}"?`,
      'Bài hát sẽ bị xóa khỏi thư viện.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () => {
            haptics.warning();
            onClose();
            onDeleteFromLibrary?.(track);
          },
        },
      ]
    );
  };

  // Cấu hình các dòng Action chính
  const mainActions = useMemo(() => {
    if (!track) return [];

    // Tính trạng thái tải xuống
    let dlLabel = 'Tải xuống';
    let dlSecondary: string | undefined;
    let dlSecondaryColor: string | undefined;

    if (downloadStatus === 'downloading') {
      dlLabel = 'Đang tải';
      dlSecondary = downloadProgress !== undefined ? `${Math.round(downloadProgress)}%` : 'Đang xử lý';
      dlSecondaryColor = tokens.colors.accent;
    } else if (downloadStatus === 'downloaded') {
      dlLabel = 'Đã tải xuống';
      dlSecondary = 'Xóa bản tải';
      dlSecondaryColor = tokens.colors.textMuted;
    } else if (downloadStatus === 'error') {
      dlLabel = 'Tải lỗi';
      dlSecondary = 'Thử lại';
      dlSecondaryColor = tokens.colors.warning;
    }

    return [
      {
        id: 'play-next',
        label: 'Phát tiếp theo',
        onPress: () => {
          haptics.tap();
          onClose();
          onPlayNext?.(track);
        },
      },
      {
        id: 'favorite',
        label: isFavorite ? 'Bỏ yêu thích' : 'Yêu thích',
        secondaryText: isFavorite ? 'Đã thích' : undefined,
        secondaryColor: isFavorite ? tokens.colors.accent : undefined,
        onPress: () => {
          haptics.tap();
          onToggleFavorite?.(track);
        },
      },
      {
        id: 'add-to-playlist',
        label:
          playlistNames && playlistNames.length > 0
            ? 'Đã trong playlist'
            : 'Thêm vào playlist',
        secondaryText:
          playlistNames && playlistNames.length > 0
            ? playlistNames.length === 1
              ? playlistNames[0]
              : `${playlistNames.length} danh sách (${playlistNames[0]}...)`
            : undefined,
        secondaryColor:
          playlistNames && playlistNames.length > 0
            ? tokens.colors.accent
            : undefined,
        onPress: () => {
          haptics.tap();
          onClose();
          onAddToPlaylist?.(track);
        },
      },
      {
        id: 'download',
        label: dlLabel,
        secondaryText: dlSecondary,
        secondaryColor: dlSecondaryColor,
        progressPercent: downloadStatus === 'downloading' ? downloadProgress : undefined,
        onPress: () => {
          haptics.tap();
          if (downloadStatus === 'downloaded') {
            Alert.alert(
              'Xóa bản tải xuống?',
              'Bài hát sẽ được chuyển về chế độ nghe trực tuyến.',
              [
                { text: 'Hủy', style: 'cancel' },
                {
                  text: 'Xóa bản tải',
                  style: 'destructive',
                  onPress: () => {
                    onDownloadPress?.(track, downloadStatus);
                  },
                },
              ]
            );
          } else {
            onDownloadPress?.(track, downloadStatus);
          }
        },
      },
      {
        id: 'edit-info',
        label: 'Sửa thông tin',
        onPress: () => {
          haptics.tap();
          onClose();
          onEditInfo?.(track);
        },
      },
    ];
  }, [
    track,
    isFavorite,
    playlistNames,
    downloadStatus,
    downloadProgress,
    onClose,
    onPlayNext,
    onToggleFavorite,
    onAddToPlaylist,
    onDownloadPress,
    onEditInfo,
  ]);

  if (!visible && translateY.value === SCREEN_HEIGHT) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => closeSheet()}
    >
      <View style={StyleSheet.absoluteFill}>
        {/* Vùng Backdrop làm mờ & chạm đóng */}
        <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => closeSheet()} />
        </Animated.View>

        {/* Sheet Container */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.sheetContainer,
              { paddingBottom: Math.max(insets.bottom, 24) },
              animatedSheetStyle,
            ]}
          >
            {/* Nền Blur & Lớp Linear Gradient tan từ màu Cover */}
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={[`${coverColor}45`, `${coverColor}10`, 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 0.55 }}
              style={StyleSheet.absoluteFill}
            />

            {/* 1. Header: Grabber + Cover 56x56 + Info */}
            <View style={styles.header}>
              {/* Grabber nhỏ thanh thoát */}
              <View style={styles.grabber} />

              {track && (
                <View style={styles.trackInfoRow}>
                  {/* Ảnh bìa bo góc 12 mang bóng đổ mềm màu cover */}
                  <View
                    style={[
                      styles.coverWrapper,
                      {
                        shadowColor: coverColor,
                      },
                    ]}
                  >
                    <Image
                      source={coverUrl ? { uri: coverUrl } : null}
                      style={styles.coverImage}
                      contentFit="cover"
                      transition={200}
                    />
                  </View>

                  {/* Thông tin bài hát */}
                  <View style={styles.titleWrapper}>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text style={styles.trackSubtitle} numberOfLines={1}>
                      {track.artist} · {formatDuration(track.duration)}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* 2. Danh sách Action chuẩn Typography, không icon */}
            <View style={styles.actionsList}>
              {mainActions.map((action) => (
                <ActionRow
                  key={action.id}
                  label={action.label}
                  secondaryText={action.secondaryText}
                  secondaryColor={action.secondaryColor}
                  progressPercent={action.progressPercent}
                  onPress={action.onPress}
                />
              ))}
            </View>

            {/* 3. Nhóm nguy hiểm (cách nhóm trên 12px không kẻ vạch) */}
            <View style={styles.dangerGroup}>
              <ActionRow
                label="Xóa khỏi thư viện"
                isDestructive
                onPress={handleDeletePress}
              />
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.colors.bgOverlay,
    zIndex: 998,
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.colors.bgSurface,
    borderTopLeftRadius: tokens.radius.sheet,
    borderTopRightRadius: tokens.radius.sheet,
    overflow: 'hidden',
    zIndex: 999,
  },
  header: {
    paddingTop: 10,
    paddingHorizontal: tokens.spacing.sheetPadding,
    paddingBottom: 16,
    alignItems: 'center',
  },
  grabber: {
    width: 36,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: tokens.colors.grabber,
    marginBottom: 16,
  },
  trackInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  coverWrapper: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.cover,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  coverImage: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.cover,
    backgroundColor: tokens.colors.bgElevated,
  },
  titleWrapper: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  trackTitle: {
    fontSize: tokens.typography.trackTitle.fontSize,
    fontWeight: tokens.typography.trackTitle.fontWeight,
    color: tokens.colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  trackSubtitle: {
    fontSize: tokens.typography.trackSubtitle.fontSize,
    fontWeight: tokens.typography.trackSubtitle.fontWeight,
    color: tokens.colors.textMuted,
  },
  actionsList: {
    paddingVertical: 4,
  },
  dangerGroup: {
    marginTop: 12,
  },
});
