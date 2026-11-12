import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Modal,
  TextInput,
  StyleSheet,
  Alert,
  Animated,
  Vibration,
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
  CloseIcon,
  QueueIcon,
  ChevronDownIcon,
  DiscIcon,
  TrashIcon,
  ClockIcon,
  DownloadIcon,
} from '../icons/SvgIcons';
import { formatTime } from '../../utils/formatTime';
import { LyricsModal } from '../LyricsModal';
import { EditTrackModal } from '../EditTrackModal';
import { EqualizerIndicator } from './EqualizerIndicator';
import { VinylRecordView } from './VinylRecordView';
import { BassWaveformVisualizer } from './BassWaveformVisualizer';
import { useOffline } from '../../context';

/**
 * Giao diện chính của màn hình Now Playing (Đang phát toàn màn hình)
 * Thiết kế chuẩn Apple Music / Spotify cho iOS:
 * - Kéo xuống hoặc bấm Chevron để đóng
 * - Ảnh bìa co giãn linh hoạt (responsive) theo chiều cao màn hình
 * - Hàng đợi phát (Queue) tích hợp nội tuyến (inline panel) thay thế ảnh bìa mượt mà
 * - Scrubber tua nhạc vùng chạm 44pt chuẩn HIG
 * - Cụm nút phát nổi bật (Play/Pause tròn to 64x64)
 * - Tích hợp Lời bài hát đồng bộ LRC (LyricsModal)
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
    customLoopTarget,
    customLoopRemaining,
    setCustomLoopCount,
    isSmartShuffle,
    togglePlay,
    next,
    previous,
    skipToTrack,
    seekTo,
    cycleRepeat,
    toggleSmartShuffle,
    removeFromQueue,
    moveQueueItem,
    sleepTimerRemainingSec,
    setSleepTimer,
    isVinylMode,
    toggleVinylMode,
  } = usePlayer();

  const { userState, toggleFavorite, fetchLyrics, saveTrack } = useLibrary();
  const { isTrackOffline, downloadTrack, isDownloading, getOfflineLyrics } = useOffline();
  const { positionSec, durationSec, progressPercent } = useProgress();

  const [barWidth, setBarWidth] = useState(0);
  const [lyricsModalVisible, setLyricsModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [sleepTimerDialogVisible, setSleepTimerDialogVisible] = useState(false);
  const [customMinutesInput, setCustomMinutesInput] = useState('');
  const [loopModalVisible, setLoopModalVisible] = useState(false);
  const [customLoopInput, setCustomLoopInput] = useState('');

  // Trạng thái kiểm tra và thông báo khi bài hát không có lời
  const [lyricsContent, setLyricsContent] = useState<string | null | undefined>(undefined);
  const [noLyricsToastVisible, setNoLyricsToastVisible] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastFadeAnim = useRef(new Animated.Value(0)).current;
  const toastTranslateAnim = useRef(new Animated.Value(8)).current;

  // Tự động kiểm tra lời bài hát cho bài hiện tại (cả offline và online)
  useEffect(() => {
    let active = true;
    if (!currentTrack) {
      setLyricsContent(null);
      return;
    }

    // 1. Kiểm tra offline trước (nhanh 1ms)
    getOfflineLyrics(currentTrack.id)
      .then((offLrc) => {
        if (!active) return;
        if (offLrc && offLrc.trim().length > 0) {
          setLyricsContent(offLrc);
          return;
        }

        // 2. Kiểm tra từ Cloudflare R2 qua Worker
        fetchLyrics(currentTrack.id)
          .then((remoteLrc) => {
            if (!active) return;
            setLyricsContent(remoteLrc && remoteLrc.trim().length > 0 ? remoteLrc : null);
          })
          .catch(() => {
            if (!active) return;
            setLyricsContent(null);
          });
      })
      .catch(() => {
        if (!active) return;
        setLyricsContent(null);
      });

    return () => {
      active = false;
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
    };
  }, [currentTrack?.id, getOfflineLyrics, fetchLyrics]);

  const hasLyrics = Boolean(
    (lyricsContent && lyricsContent.trim().length > 0) ||
    Boolean(currentTrack?.lyrics?.file)
  );

  const hideNoLyricsDialog = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    Animated.parallel([
      Animated.timing(toastFadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(toastTranslateAnim, { toValue: 8, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      setNoLyricsToastVisible(false);
    });
  };

  const showNoLyricsDialog = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setNoLyricsToastVisible(true);
    toastFadeAnim.setValue(0);
    toastTranslateAnim.setValue(8);
    Animated.parallel([
      Animated.timing(toastFadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(toastTranslateAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();

    // Tự động biến mất sau đúng 2 giây
    toastTimeoutRef.current = setTimeout(() => {
      hideNoLyricsDialog();
    }, 2000);
  };

  const handleLyricsPress = () => {
    if (!currentTrack) return;
    if (!hasLyrics) {
      showNoLyricsDialog();
      return;
    }
    setLyricsModalVisible(true);
  };

  // 1. Animation "Thở" cho ảnh bìa (Artwork Breath Scale) chuẩn Apple Music
  const artworkScale = useRef(new Animated.Value(playerState.isPlaying ? 1.0 : 0.88)).current;
  useEffect(() => {
    Animated.spring(artworkScale, {
      toValue: playerState.isPlaying ? 1.0 : 0.88,
      friction: 8,
      tension: 45,
      useNativeDriver: true,
    }).start();
  }, [playerState.isPlaying, artworkScale]);

  // 2. Animation "Nảy trái tim" khi thả tim (Favorite Pop Spring Bounce)
  const heartScale = useRef(new Animated.Value(1)).current;

  // 3. Animation nảy vật lý cho nút Play/Pause
  const playBtnScale = useRef(new Animated.Value(1)).current;
  const onPlayPressIn = () => {
    Animated.spring(playBtnScale, { toValue: 0.88, friction: 6, tension: 160, useNativeDriver: true }).start();
  };
  const onPlayPressOut = () => {
    Animated.spring(playBtnScale, { toValue: 1.0, friction: 4, tension: 120, useNativeDriver: true }).start();
  };

  // Kích thước ảnh bìa & panel hàng đợi thích ứng an toàn trên mọi màn hình Face ID từ 375x812 đến 440x956
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
      Animated.sequence([
        Animated.timing(heartScale, { toValue: 0.75, duration: 80, useNativeDriver: true }),
        Animated.spring(heartScale, { toValue: 1.35, friction: 3, tension: 220, useNativeDriver: true }),
        Animated.spring(heartScale, { toValue: 1.0, friction: 6, tension: 160, useNativeDriver: true }),
      ]).start();
      toggleFavorite(currentTrack.id);
    }
  };

  const handleFetchLyrics = useCallback(async (id: string) => {
    const offlineLrc = await getOfflineLyrics(id);
    if (offlineLrc) return offlineLrc;
    return await fetchLyrics(id);
  }, [getOfflineLyrics, fetchLyrics]);

  const handleSelectQueueItem = (index: number) => {
    skipToTrack(index);
  };

  const handleRemoveQueueItem = (e: { stopPropagation?: () => void }, index: number) => {
    e.stopPropagation?.();
    removeFromQueue(index);
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
          {showQueue && (
            <Text style={styles.headerTitle}>HÀNG ĐỢI PHÁT</Text>
          )}
          {sleepTimerRemainingSec !== null ? (
            <TouchableOpacity
              style={styles.timerHeaderBadge}
              onPress={() => setSleepTimerDialogVisible(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Xem hẹn giờ ngủ"
            >
              <ClockIcon size={18} color={colors.primary} />
            </TouchableOpacity>
          ) : currentTrack?.album && !showQueue ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {currentTrack.album}
            </Text>
          ) : null}
        </View>

        {/* Nút bật/tắt Chế độ Đĩa Than Vinyl */}
        <TouchableOpacity
          style={[styles.turntableToggleBtn, isVinylMode && styles.turntableToggleBtnActive]}
          onPress={toggleVinylMode}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Chuyển chế độ Đĩa Than Vinyl"
        >
          <DiscIcon size={14} color={isVinylMode ? '#000000' : colors.primary} />
          <Text style={[styles.turntableToggleText, isVinylMode && styles.turntableToggleTextActive]}>
            {isVinylMode ? 'VINYL' : 'BÌA'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Nội dung cuộn an toàn phòng vệ (ScrollView) không bao giờ bị cắt trên màn hình nhỏ */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* VÙNG CHUYỂN ĐỔI: Ảnh bìa vuông HOẶC Đĩa Than Vinyl HOẶC Hàng đợi phát */}
        {!showQueue ? (
          isVinylMode ? (
            <VinylRecordView
              coverUri={currentTrack?.cover}
              isPlaying={playerState.isPlaying}
              positionSec={positionSec}
              durationSec={durationSec}
              size={Math.min(artworkSize, 305)}
            />
          ) : (
            <Animated.View
              style={
                [
                  styles.artworkContainer,
                  {
                    width: artworkSize,
                    height: artworkSize,
                    transform: [{ scale: artworkScale }],
                  },
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
            </Animated.View>
          )
        ) : (
          <View
            style={[
              styles.queuePanelContainer,
              { width: artworkSize, height: artworkSize },
            ]}
          >
            <View style={styles.queuePanelHeader}>
              <Text style={styles.queuePanelTitle}>
                DANH SÁCH CHỜ ({tracks.length})
              </Text>
              <TouchableOpacity
                onPress={() => setShowQueue(false)}
                style={styles.queueBackBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Quay lại ảnh bìa"
              >
                <DiscIcon size={16} color={colors.primary} />
                <Text style={styles.queueBackBtnText}>Xem bìa</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={tracks}
              keyExtractor={(item, idx) => `${item.id}-${idx}`}
              contentContainerStyle={styles.queueListInner}
              showsVerticalScrollIndicator={true}
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
                        <EqualizerIndicator isPlaying={playerState.isPlaying} size={15} color={colors.primary} />
                      ) : (
                        <Text style={styles.queueIndexText}>{index + 1}</Text>
                      )}
                    </View>

                    {/* Ảnh bìa bài hát trong hàng đợi */}
                    <View style={styles.queueCoverWrapper}>
                      {item.cover ? (
                        <Image source={{ uri: item.cover }} style={styles.queueCoverImg} resizeMode="cover" />
                      ) : (
                        <View style={styles.queueCoverPlaceholder}>
                          <DiscIcon size={16} color={colors.textTertiary} />
                        </View>
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

                    {/* Cụm nút di chuyển bài lên / xuống */}
                    <View style={styles.queueReorderGroup}>
                      {index > 0 && (
                        <TouchableOpacity
                          style={styles.reorderBtn}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            moveQueueItem(index, index - 1);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Di chuyển bài lên"
                        >
                          <Text style={styles.reorderBtnText}>↑</Text>
                        </TouchableOpacity>
                      )}
                      {index < tracks.length - 1 && (
                        <TouchableOpacity
                          style={styles.reorderBtn}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            moveQueueItem(index, index + 1);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Di chuyển bài xuống"
                        >
                          <Text style={styles.reorderBtnText}>↓</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Nút xóa bài khỏi hàng đợi */}
                    <TouchableOpacity
                      style={styles.queueRemoveBtn}
                      onPress={(e) => handleRemoveQueueItem(e, index)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Xóa ${item.title} khỏi hàng đợi`}
                    >
                      <TrashIcon size={16} color={colors.dangerLight} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

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
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Bỏ thích bài hát' : 'Thêm vào yêu thích'}
          >
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <HeartIcon
                size={24}
                color={isFavorite ? colors.primary : colors.textSecondary}
                fill={isFavorite ? colors.primary : 'none'}
              />
            </Animated.View>
          </TouchableOpacity>
        </View>

        {/* Cụm Equalizer Sóng Nhạc Dày Đậm (Bass Waveform Visualizer LED Stereo VU Meter) */}
        <BassWaveformVisualizer isPlaying={playerState.isPlaying} height={28} />

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

          {/* Nút Play/Pause tròn to nổi bật 64x64 nảy vật lý đàn hồi */}
          <TouchableOpacity
            style={styles.mainPlayButton}
            onPress={togglePlay}
            onPressIn={onPlayPressIn}
            onPressOut={onPlayPressOut}
            disabled={tracks.length === 0 && !playerState.isPlaying}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={playerState.isPlaying ? 'Tạm dừng' : 'Phát'}
          >
            <Animated.View style={{ transform: [{ scale: playBtnScale }] }}>
              {playerState.isPlaying ? (
                <PauseIcon size={30} color={colors.textDark} />
              ) : (
                <PlayIcon size={30} color={colors.textDark} />
              )}
            </Animated.View>
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
            onLongPress={() => {
              Vibration.vibrate(15);
              setLoopModalVisible(true);
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Đổi chế độ lặp lại (Nhấn giữ để chọn số lần lặp)"
          >
            {repeatMode === 'track' ? (
              <RepeatOneIcon size={22} color={colors.primary} />
            ) : (
              <RepeatIcon
                size={22}
                color={repeatMode !== 'off' ? colors.primary : colors.textTertiary}
              />
            )}
            {customLoopRemaining !== null && (
              <View style={styles.loopBadge}>
                <Text style={styles.loopBadgeText}>{customLoopRemaining}x</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Hàng 4 nút tính năng phụ dạng icon tròn tối giản (Icon-only) */}
        <View style={styles.bottomButtonsRow}>
          {/* Nút 1: Lời bài hát */}
          <TouchableOpacity
            style={[
              styles.bottomButton,
              lyricsModalVisible && styles.bottomButtonActive,
              !hasLyrics && styles.bottomButtonDisabled,
            ]}
            disabled={!currentTrack}
            onPress={handleLyricsPress}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={hasLyrics ? 'Mở lời bài hát' : 'Bài hát chưa có lời (Bấm để xem thông báo)'}
          >
            <LyricsIcon
              size={20}
              color={
                lyricsModalVisible
                  ? colors.primary
                  : hasLyrics
                    ? colors.textPrimary
                    : colors.textTertiary
              }
            />
          </TouchableOpacity>

          {/* Nút 2: Hàng đợi / Ảnh bìa */}
          <TouchableOpacity
            style={[styles.bottomButton, showQueue && styles.bottomButtonActive]}
            onPress={() => setShowQueue(!showQueue)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={showQueue ? 'Hiển thị ảnh bìa' : `Hiển thị danh sách hàng đợi (${tracks.length} bài)`}
          >
            {showQueue ? (
              <DiscIcon size={20} color={colors.primary} />
            ) : (
              <QueueIcon size={20} color={colors.textPrimary} />
            )}
          </TouchableOpacity>

          {/* Nút 3: Tải bài hát ngoại tuyến */}
          <TouchableOpacity
            style={[
              styles.bottomButton,
              Boolean(currentTrack && isTrackOffline(currentTrack.id)) && styles.bottomButtonActive,
            ]}
            disabled={!currentTrack || Boolean(currentTrack && isDownloading[currentTrack.id])}
            onPress={async () => {
              if (currentTrack) {
                if (isTrackOffline(currentTrack.id)) {
                  Alert.alert('Đã tải', 'Bài hát này đã có sẵn trên máy của bạn.');
                } else {
                  await downloadTrack(currentTrack);
                }
              }
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Tải bài hát về máy"
          >
            <DownloadIcon
              size={20}
              color={
                currentTrack && isTrackOffline(currentTrack.id)
                  ? colors.primary
                  : currentTrack
                    ? colors.textPrimary
                    : colors.textTertiary
              }
            />
          </TouchableOpacity>

          {/* Nút 4: Hẹn giờ tắt nhạc */}
          <TouchableOpacity
            style={[
              styles.bottomButton,
              sleepTimerRemainingSec !== null && styles.bottomButtonActive,
            ]}
            onPress={() => setSleepTimerDialogVisible(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={
              sleepTimerRemainingSec !== null
                ? `Hẹn giờ đang bật: còn ${formatTime(sleepTimerRemainingSec)}`
                : 'Hẹn giờ tắt nhạc'
            }
          >
            <ClockIcon
              size={18}
              color={sleepTimerRemainingSec !== null ? colors.primary : colors.textPrimary}
            />
            {sleepTimerRemainingSec !== null && (
              <Text style={styles.bottomTimerText}>
                {formatTime(sleepTimerRemainingSec)}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modal Lời bài hát đồng bộ LRC (giữ nguyên trạng) */}
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
          setEditModalVisible(true);
        }}
        onFetchLyrics={handleFetchLyrics}
      />

      {/* Modal Chỉnh sửa Lời bài hát & Metadata trực tiếp từ Now Playing */}
      <EditTrackModal
        visible={editModalVisible}
        track={currentTrack}
        onClose={() => setEditModalVisible(false)}
        onSave={async (id, updates) => {
          await saveTrack(id, updates);
          if (updates.lyrics !== undefined) {
            setLyricsContent(updates.lyrics.trim().length > 0 ? updates.lyrics : null);
          }
        }}
        onFetchLyrics={handleFetchLyrics}
      />

      {/* Modal Hẹn giờ tắt nhạc (Sleep Timer Dialog) */}
      <Modal
        visible={sleepTimerDialogVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSleepTimerDialogVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSleepTimerDialogVisible(false)}
        >
          <View style={styles.sleepTimerCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.sleepTimerTitle}>Hẹn giờ tắt nhạc</Text>
            <Text style={styles.sleepTimerSubtitle}>
              Tự động tạm dừng phát nhạc khi hết thời gian hẹn
            </Text>

            <View style={styles.sleepTimerOptionsCol}>
              <View style={styles.sleepTimerGrid}>
                {[15, 30, 45, 60].map((mins) => (
                  <TouchableOpacity
                    key={mins}
                    style={styles.sleepTimerGridBtn}
                    onPress={() => {
                      setSleepTimer(mins);
                      setSleepTimerDialogVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.sleepTimerOptionText}>{mins} phút</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tùy chọn tự nhập số phút */}
              <View style={styles.customTimerRow}>
                <TextInput
                  style={styles.customTimerInput}
                  placeholder="Nhập số phút..."
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  value={customMinutesInput}
                  onChangeText={setCustomMinutesInput}
                  maxLength={4}
                />
                <TouchableOpacity
                  style={styles.customTimerBtn}
                  onPress={() => {
                    const parsed = parseInt(customMinutesInput.trim(), 10);
                    if (!isNaN(parsed) && parsed > 0 && parsed <= 720) {
                      setSleepTimer(parsed);
                      setCustomMinutesInput('');
                      setSleepTimerDialogVisible(false);
                    } else {
                      Alert.alert('Không hợp lệ', 'Vui lòng nhập số phút từ 1 đến 720');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.customTimerBtnText}>Bắt đầu</Text>
                </TouchableOpacity>
              </View>

              {sleepTimerRemainingSec !== null && (
                <TouchableOpacity
                  style={[styles.sleepTimerOptionBtn, styles.sleepTimerTurnOffBtn]}
                  onPress={() => {
                    setSleepTimer(null);
                    setSleepTimerDialogVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sleepTimerTurnOffText}>Tắt hẹn giờ</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.sleepTimerCancelBtn}
              onPress={() => setSleepTimerDialogVisible(false)}
            >
              <Text style={styles.sleepTimerCancelText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal Cài đặt Lặp lại bài hát (Loop Count Modal) */}
      <Modal
        visible={loopModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setLoopModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setLoopModalVisible(false)}
        >
          <View style={styles.sleepTimerCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.sleepTimerTitle}>Lặp lại bài hát</Text>
            <Text style={styles.sleepTimerSubtitle}>
              {customLoopRemaining !== null
                ? `Đang lặp: còn ${customLoopRemaining} lần phát nữa`
                : repeatMode === 'track'
                  ? 'Đang lặp vô hạn bài hát hiện tại'
                  : 'Chọn số lần lặp hoặc tự nhập theo ý bạn'}
            </Text>

            <View style={styles.sleepTimerOptionsCol}>
              <View style={styles.sleepTimerGrid}>
                {[
                  { label: 'Vô hạn', count: null, isInfinite: true },
                  { label: '2 lần', count: 2 },
                  { label: '3 lần', count: 3 },
                  { label: '5 lần', count: 5 },
                ].map((item) => {
                  const isActive = item.isInfinite
                    ? repeatMode === 'track' && customLoopRemaining === null
                    : customLoopTarget === item.count;
                  return (
                    <TouchableOpacity
                      key={item.label}
                      style={[styles.sleepTimerGridBtn, isActive && styles.loopOptionActive]}
                      onPress={async () => {
                        Vibration.vibrate(10);
                        if (item.isInfinite) {
                          await setCustomLoopCount(null);
                          await cycleRepeat();
                        } else if (item.count) {
                          await setCustomLoopCount(item.count);
                        }
                        setLoopModalVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.sleepTimerOptionText,
                          isActive && styles.loopOptionActiveText,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Tùy chọn tự nhập số lần lặp */}
              <View style={styles.customTimerRow}>
                <TextInput
                  style={styles.customTimerInput}
                  placeholder="Nhập số lần lặp (VD: 10)..."
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  value={customLoopInput}
                  onChangeText={setCustomLoopInput}
                  maxLength={3}
                />
                <TouchableOpacity
                  style={styles.customTimerBtn}
                  onPress={async () => {
                    Vibration.vibrate(10);
                    const parsed = parseInt(customLoopInput.trim(), 10);
                    if (!isNaN(parsed) && parsed > 0 && parsed <= 999) {
                      await setCustomLoopCount(parsed);
                      setCustomLoopInput('');
                      setLoopModalVisible(false);
                    } else {
                      Alert.alert('Không hợp lệ', 'Vui lòng nhập số lần lặp từ 1 đến 999');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.customTimerBtnText}>Áp dụng</Text>
                </TouchableOpacity>
              </View>

              {(repeatMode === 'track' || customLoopRemaining !== null) && (
                <TouchableOpacity
                  style={[styles.sleepTimerOptionBtn, styles.sleepTimerTurnOffBtn]}
                  onPress={async () => {
                    Vibration.vibrate(10);
                    await setCustomLoopCount(null);
                    setLoopModalVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sleepTimerTurnOffText}>Tắt lặp lại bài này</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.sleepTimerCancelBtn}
              onPress={() => setLoopModalVisible(false)}
            >
              <Text style={styles.sleepTimerCancelText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Dialog nhẹ khi bài hát không có lời - Tự biến mất sau 2s hoặc tự bấm nút tắt */}
      {noLyricsToastVisible && (
        <Animated.View
          style={[
            styles.noLyricsToast,
            {
              bottom: insets.bottom + 85,
              opacity: toastFadeAnim,
              transform: [{ translateY: toastTranslateAnim }],
            },
          ]}
        >
          <View style={styles.noLyricsToastContent}>
            <View style={styles.noLyricsIconWrap}>
              <LyricsIcon size={14} color={colors.textSecondary} />
            </View>
            <Text style={styles.noLyricsToastText}>Bài hát này chưa có lời</Text>
          </View>
          <TouchableOpacity
            onPress={hideNoLyricsDialog}
            style={styles.noLyricsCloseBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Đóng thông báo"
          >
            <CloseIcon size={12} color={colors.textSecondary} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View >
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
  turntableToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  turntableToggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  turntableToggleText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.5,
  },
  turntableToggleTextActive: {
    color: '#000000',
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
  // Panel Hàng đợi nội tuyến thay thế vùng ảnh bìa
  queuePanelContainer: {
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceElevated,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  queuePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  queuePanelTitle: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  queueBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
  },
  queueBackBtnText: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  queueListInner: {
    paddingVertical: spacing.xs,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    marginBottom: 2,
  },
  queueItemActive: {
    backgroundColor: colors.surface,
  },
  queueItemIndex: {
    width: 20,
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  queueCoverWrapper: {
    width: 36,
    height: 36,
    borderRadius: radius.xs,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    marginRight: spacing.sm,
  },
  queueCoverImg: {
    width: '100%',
    height: '100%',
  },
  queueCoverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  queueIndexText: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
  },
  queueItemInfo: {
    flex: 1,
    marginRight: spacing.xs,
  },
  queueItemTitle: {
    fontSize: fontSizes.subhead,
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
    marginTop: 1,
  },
  queueRemoveBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
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
    alignItems: 'center',
    gap: spacing.xl,
    width: '100%',
    marginTop: spacing.lg,
  },
  bottomButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceHighlight,
  },
  bottomButtonActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  bottomButtonDisabled: {
    opacity: 0.35,
  },
  bottomButtonText: {
    display: 'none',
  },
  bottomButtonTextActive: {
    display: 'none',
  },
  queueReorderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginRight: spacing.xs,
  },
  reorderBtn: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtnText: {
    color: colors.textSecondary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  sleepTimerCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sleepTimerTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  sleepTimerSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    textAlign: 'center',
    marginTop: spacing.xxs,
    marginBottom: spacing.md,
  },
  sleepTimerOptionsCol: {
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sleepTimerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  sleepTimerGridBtn: {
    width: '48%',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  customTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  customTimerInput: {
    flex: 1,
    height: 40,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  customTimerBtn: {
    backgroundColor: colors.primary,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customTimerBtnText: {
    color: colors.textDark,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.bold,
  },
  sleepTimerOptionBtn: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sleepTimerOptionText: {
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.semibold,
  },
  sleepTimerTurnOffBtn: {
    borderColor: colors.danger,
    backgroundColor: colors.surfacePressed,
  },
  sleepTimerTurnOffText: {
    color: colors.danger,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
  },
  sleepTimerCancelBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  sleepTimerCancelText: {
    color: colors.textTertiary,
    fontSize: fontSizes.subhead,
  },
  loopBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loopBadgeText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: fontWeights.bold,
  },
  loopOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  loopOptionActiveText: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  noLyricsToast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(26, 29, 36, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 8,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: radius.pill,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 9999,
    maxWidth: '85%',
  },
  noLyricsToastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  noLyricsIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noLyricsToastText: {
    color: colors.textPrimary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.medium,
    marginRight: spacing.md,
  },
  noLyricsCloseBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    gap: 4,
    marginTop: 2,
  },
  timerHeaderBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: fontWeights.bold,
  },
  bottomTimerText: {
    color: colors.primary,
    fontSize: 9.5,
    fontWeight: fontWeights.bold,
    marginTop: 2,
  },
});
