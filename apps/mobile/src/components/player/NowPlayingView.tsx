import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  FlatList,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayer, useProgress, useLibrary } from '../../context';
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
  radius,
  useResponsive,
} from '../../theme';
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PrevIcon,
  ShuffleIcon,
  RepeatIcon,
  RepeatOneIcon,
  HeartIcon,
  LyricsIcon,
  QueueIcon,
  ChevronDownIcon,
  DiscIcon,
  CloseIcon,
} from '../icons/SvgIcons';
import { formatTime } from '../../utils/formatTime';
import { LyricsModal } from '../LyricsModal';

/**
 * Giao diện chính của màn hình Now Playing (Đang phát toàn màn hình)
 * Thiết kế chuẩn Apple Music / Spotify cho iOS:
 * - Kéo xuống hoặc bấm Chevron để đóng
 * - Ảnh bìa co giãn linh hoạt (responsive) theo chiều cao màn hình
 * - Scrubber tua nhạc vùng chạm 44pt chuẩn HIG
 * - Cụm nút phát nổi bật (Play/Pause tròn to 64x64)
 * - Tích hợp Hàng đợi phát & Lời bài hát đồng bộ LRC
 */
export function NowPlayingView() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useResponsive();

  const {
    tracks,
    currentTrack,
    currentTrackIndex,
    playerState,
    repeatMode,
    isSmartShuffle,
    togglePlay,
    next,
    previous,
    skipToTrack,
    seekTo,
    cycleRepeat,
    toggleSmartShuffle,
  } = usePlayer();

  const { userState, toggleFavorite, fetchLyrics } = useLibrary();
  const { positionSec, durationSec, progressPercent } = useProgress();

  const [barWidth, setBarWidth] = useState(0);
  const [lyricsModalVisible, setLyricsModalVisible] = useState(false);
  const [queueModalVisible, setQueueModalVisible] = useState(false);

  // Kích thước ảnh bìa thích ứng an toàn trên mọi màn hình Face ID từ 375x812 đến 440x956
  // Chiếm tối đa 38% chiều cao màn hình nhưng không vượt quá chiều rộng trừ lề
  const artworkSize = Math.min(
    width - spacing.xl * 2,
    Math.max(200, Math.round(height * 0.36))
  );

  const isFavorite = currentTrack
    ? userState.favoriteIds.includes(currentTrack.id)
    : false;

  const handleClose = () => {
    router.back();
  };

  const handleSeekPress = (locationX: number) => {
    if (barWidth <= 0 || durationSec <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / barWidth));
    seekTo(ratio * durationSec);
  };

  const handleToggleFavorite = () => {
    if (currentTrack) {
      toggleFavorite(currentTrack.id);
    }
  };

  const handleSelectQueueItem = (index: number) => {
    skipToTrack(index);
    setQueueModalVisible(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Thanh Header: Kéo xuống đóng & Tiêu đề */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={handleClose}
          style={styles.headerButton}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Thu nhỏ màn hình đang phát"
        >
          <ChevronDownIcon size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>ĐANG PHÁT</Text>
          {currentTrack?.album && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {currentTrack.album}
            </Text>
          )}
        </View>

        <View style={styles.headerButton} />
      </View>

      {/* Nội dung cuộn an toàn phòng vệ (ScrollView) không bao giờ bị cắt trên màn hình nhỏ */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Ảnh bìa bài hát responsive */}
        <View
          style={[
            styles.artworkContainer,
            { width: artworkSize, height: artworkSize },
          ]}
        >
          {currentTrack?.cover ? (
            <Image
              source={{ uri: currentTrack.cover }}
              style={styles.artworkImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.artworkPlaceholder}>
              <DiscIcon size={Math.round(artworkSize * 0.35)} color={colors.borderLight} />
              <Text style={styles.artworkEmptyText}>
                {currentTrack ? 'Không có ảnh bìa' : 'Chưa có bài hát'}
              </Text>
            </View>
          )}
        </View>

        {/* Thông tin bài hát + Nút Tim */}
        <View style={styles.trackInfoRow}>
          <View style={styles.trackInfoTextCol}>
            <Text style={styles.titleText} numberOfLines={1} ellipsizeMode="tail">
              {currentTrack ? currentTrack.title : 'Chưa có bài hát'}
            </Text>
            <Text style={styles.artistText} numberOfLines={1} ellipsizeMode="tail">
              {currentTrack ? currentTrack.artist : 'Chọn một bài hát để bắt đầu nghe'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleToggleFavorite}
            style={styles.heartButton}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Bỏ thích bài hát' : 'Thêm vào yêu thích'}
          >
            <HeartIcon
              size={24}
              color={isFavorite ? colors.primary : colors.textSecondary}
              fill={isFavorite ? colors.primary : 'none'}
            />
          </TouchableOpacity>
        </View>

        {/* Thanh tua tiến trình nhạc (Scrubber) với vùng chạm 44pt chuẩn iOS HIG */}
        <View style={styles.scrubberContainer}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.scrubberTouchable}
            onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
            onPress={(e) => handleSeekPress(e.nativeEvent.locationX)}
            accessibilityRole="adjustable"
            accessibilityLabel="Thanh tua tiến trình bài hát"
          >
            <View style={styles.scrubberTrack}>
              <View style={[styles.scrubberFill, { width: `${progressPercent}%` }]} />
            </View>
          </TouchableOpacity>

          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(positionSec)}</Text>
            <Text style={styles.timeText}>{formatTime(durationSec)}</Text>
          </View>
        </View>

        {/* Cụm điều khiển chính: Shuffle, Prev, Play/Pause, Next, Repeat */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.auxControlButton}
            onPress={toggleSmartShuffle}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={isSmartShuffle ? 'Tắt trộn bài' : 'Bật trộn bài'}
          >
            <ShuffleIcon
              size={22}
              color={isSmartShuffle ? colors.primary : colors.textTertiary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={previous}
            disabled={tracks.length === 0}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Bài trước"
          >
            <PrevIcon size={28} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* Nút Play/Pause tròn to nổi bật 64x64 */}
          <TouchableOpacity
            style={styles.mainPlayButton}
            onPress={togglePlay}
            disabled={tracks.length === 0 && !playerState.isPlaying}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={playerState.isPlaying ? 'Tạm dừng' : 'Phát'}
          >
            {playerState.isPlaying ? (
              <PauseIcon size={30} color={colors.textDark} />
            ) : (
              <PlayIcon size={30} color={colors.textDark} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={next}
            disabled={tracks.length === 0}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Bài tiếp theo"
          >
            <NextIcon size={28} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.auxControlButton}
            onPress={cycleRepeat}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Đổi chế độ lặp lại"
          >
            {repeatMode === 'track' ? (
              <RepeatOneIcon size={22} color={colors.primary} />
            ) : (
              <RepeatIcon
                size={22}
                color={repeatMode !== 'off' ? colors.primary : colors.textTertiary}
              />
            )}
          </TouchableOpacity>
        </View>

        {/* Hàng nút tính năng phụ: Lời nhạc & Hàng đợi */}
        <View style={styles.bottomButtonsRow}>
          <TouchableOpacity
            style={[styles.bottomButton, lyricsModalVisible && styles.bottomButtonActive]}
            disabled={!currentTrack}
            onPress={() => setLyricsModalVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Mở lời bài hát"
          >
            <LyricsIcon
              size={18}
              color={currentTrack ? colors.primary : colors.textTertiary}
            />
            <Text
              style={[
                styles.bottomButtonText,
                currentTrack && styles.bottomButtonTextActive,
              ]}
            >
              Lời nhạc
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.bottomButton, queueModalVisible && styles.bottomButtonActive]}
            onPress={() => setQueueModalVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Mở danh sách hàng đợi phát"
          >
            <QueueIcon size={18} color={colors.primary} />
            <Text style={[styles.bottomButtonText, styles.bottomButtonTextActive]}>
              Hàng đợi ({tracks.length})
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modal Lời bài hát đồng bộ LRC (tái dùng LyricsModal đã có) */}
      <LyricsModal
        visible={lyricsModalVisible}
        track={currentTrack}
        currentTimeSec={positionSec}
        onClose={() => setLyricsModalVisible(false)}
        onSeek={(seconds) => {
          seekTo(seconds);
        }}
        onOpenEditLyrics={() => {
          setLyricsModalVisible(false);
        }}
        onFetchLyrics={fetchLyrics}
      />

      {/* Modal Sheet Hàng đợi phát (Queue) */}
      <Modal
        visible={queueModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setQueueModalVisible(false)}
      >
        <View style={[styles.queueModalRoot, { paddingTop: insets.top }]}>
          <View style={styles.queueHeaderRow}>
            <Text style={styles.queueHeaderTitle}>Hàng đợi phát</Text>
            <TouchableOpacity
              onPress={() => setQueueModalVisible(false)}
              style={styles.queueCloseButton}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <CloseIcon size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={tracks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.queueListContent}
            renderItem={({ item, index }) => {
              const isCurrent = currentTrackIndex === index;
              return (
                <TouchableOpacity
                  style={[
                    styles.queueItem,
                    isCurrent && styles.queueItemActive,
                  ]}
                  onPress={() => handleSelectQueueItem(index)}
                  activeOpacity={0.7}
                >
                  <View style={styles.queueItemIndex}>
                    {isCurrent ? (
                      playerState.isPlaying ? (
                        <PauseIcon size={14} color={colors.primary} />
                      ) : (
                        <PlayIcon size={14} color={colors.primary} />
                      )
                    ) : (
                      <Text style={styles.queueIndexText}>{index + 1}</Text>
                    )}
                  </View>
                  <View style={styles.queueItemInfo}>
                    <Text
                      style={[
                        styles.queueItemTitle,
                        isCurrent && styles.queueItemTitleActive,
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={styles.queueItemArtist} numberOfLines={1}>
                      {item.artist}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    letterSpacing: 1.2,
  },
  headerSubtitle: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
    marginTop: 2,
    maxWidth: 200,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  artworkContainer: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: colors.textDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  artworkImage: {
    width: '100%',
    height: '100%',
  },
  artworkPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  artworkEmptyText: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  trackInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.md,
  },
  trackInfoTextCol: {
    flex: 1,
    marginRight: spacing.md,
  },
  titleText: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  artistText: {
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    marginTop: 4,
  },
  heartButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrubberContainer: {
    width: '100%',
    marginBottom: spacing.md,
  },
  scrubberTouchable: {
    height: 44,
    justifyContent: 'center',
  },
  scrubberTrack: {
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  scrubberFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xxs,
  },
  timeText: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
    fontWeight: fontWeights.medium,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  auxControlButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainPlayButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    width: '100%',
    marginTop: spacing.md,
  },
  bottomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    gap: spacing.xs,
  },
  bottomButtonActive: {
    backgroundColor: colors.surface,
  },
  bottomButtonText: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
    color: colors.textTertiary,
  },
  bottomButtonTextActive: {
    color: colors.textPrimary,
  },
  queueModalRoot: {
    flex: 1,
    backgroundColor: colors.backgroundElevated,
  },
  queueHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  queueHeaderTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  queueCloseButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  queueListContent: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  queueItemActive: {
    backgroundColor: colors.surfaceElevated,
  },
  queueItemIndex: {
    width: 24,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  queueIndexText: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
  },
  queueItemInfo: {
    flex: 1,
  },
  queueItemTitle: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.medium,
    color: colors.textPrimary,
  },
  queueItemTitleActive: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  queueItemArtist: {
    fontSize: fontSizes.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
