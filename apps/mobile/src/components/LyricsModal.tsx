import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Track } from '@music-app/shared';
import { parseLrc, findActiveLrcIndex, formatLrcSpacing, type LrcLine } from '@music-app/shared';
import { EditIcon, LyricsIcon } from './icons/SvgIcons';
import { ModalHeader } from './ModalHeader';
import { LyricPosterModal } from './player/LyricPosterModal';
import {
  colors,
  spacing,
  radius,
  fontSizes,
  fontWeights,
  lineHeights,
  layout,
} from '../theme';

export interface LyricsModalProps {
  visible: boolean;
  track: Track | null;
  currentTimeSec: number;
  onClose: () => void;
  onSeek?: (seconds: number) => void;
  onOpenEditLyrics: (track: Track) => void;
  onFetchLyrics: (trackId: string) => Promise<string | null>;
}

const DEFAULT_LINE_HEIGHT = 60;
const LYRICS_TOP_PADDING = 60;
const LYRICS_BOTTOM_PADDING = 320;

export function LyricsModal({
  visible,
  track,
  currentTimeSec,
  onClose,
  onSeek,
  onOpenEditLyrics,
  onFetchLyrics,
}: LyricsModalProps) {
  const [rawLyrics, setRawLyrics] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [posterModalVisible, setPosterModalVisible] = useState(false);
  const [selectedLyricForPoster, setSelectedLyricForPoster] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const userScrolledRef = useRef(false);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineYOffsets = useRef<{ [index: number]: number }>({});
  const loadedTrackIdRef = useRef<string | null>(null);
  const onFetchLyricsRef = useRef(onFetchLyrics);
  onFetchLyricsRef.current = onFetchLyrics;

  // Nạp lời bài hát một lần duy nhất khi mở modal hoặc đổi bài (tránh loading lặp vô hạn)
  useEffect(() => {
    if (visible && track) {
      if (loadedTrackIdRef.current === track.id && rawLyrics !== null) {
        return;
      }
      setIsLoading(true);
      userScrolledRef.current = false;
      lineYOffsets.current = {};
      loadedTrackIdRef.current = track.id;

      onFetchLyricsRef.current(track.id)
        .then((content) => {
          setRawLyrics(formatLrcSpacing(content));
        })
        .catch((err) => {
          console.warn('Không tải được lời bài hát:', err);
          setRawLyrics(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [visible, track?.id, rawLyrics]);

  // Parse các dòng LRC (nếu có mốc thời gian)
  const lrcLines = useMemo<LrcLine[]>(() => {
    if (!rawLyrics) return [];
    return parseLrc(rawLyrics);
  }, [rawLyrics]);

  const isSynced = lrcLines.length > 0;

  // Tìm chỉ số dòng đang phát bằng Binary Search O(log N)
  const activeIndex = useMemo(() => {
    if (!isSynced) return -1;
    return findActiveLrcIndex(lrcLines, currentTimeSec);
  }, [isSynced, lrcLines, currentTimeSec]);

  // Tự động cuộn mượt mà chỉ khi đổi dòng câu hát (tránh giật màn hình ở mỗi tick thời gian)
  const prevActiveIndexRef = useRef<number>(-1);
  useEffect(() => {
    if (visible && isSynced && activeIndex >= 0 && !userScrolledRef.current) {
      if (prevActiveIndexRef.current !== activeIndex) {
        prevActiveIndexRef.current = activeIndex;
        const realY = lineYOffsets.current[activeIndex];
        const targetY =
          typeof realY === 'number'
            ? Math.max(0, realY - 140)
            : Math.max(0, activeIndex * DEFAULT_LINE_HEIGHT - 140);
        scrollRef.current?.scrollTo({ y: targetY, animated: true });
      }
    }
  }, [visible, isSynced, activeIndex]);

  const handleScrollBegin = () => {
    userScrolledRef.current = true;
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
  };

  const handleScrollEnd = () => {
    // Sau 3.5 giây không vuốt, tiếp tục tự động bám theo nhạc
    userScrollTimeoutRef.current = setTimeout(() => {
      userScrolledRef.current = false;
    }, 3500);
  };

  // Render nội dung dòng hát đang phát kèm hiệu ứng tô sáng karaoke từng chữ
  const renderLineContent = (line: LrcLine, idx: number, isActive: boolean) => {
    if (!line.text) {
      return (
        <Text style={[styles.lyricText, isActive && styles.lyricTextActive]}>
          ♪
        </Text>
      );
    }

    if (!isActive) {
      const isPast = activeIndex >= 0 && idx < activeIndex;
      return (
        <Text style={[styles.lyricText, isPast ? styles.lyricTextPast : styles.lyricTextFuture]}>
          {line.text}
        </Text>
      );
    }

    // Hiển thị trọn vẹn cả câu hát khi đang active (đồng bộ chuẩn Apple Music / Spotify)
    return (
      <Text style={styles.lyricTextActive}>
        {line.text}
      </Text>
    );
  };

  if (!track) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <StatusBar barStyle="light-content" />

        {/* Thanh gạt kéo xuống chuẩn iOS (Pill handle) */}
        <View style={styles.dragPillWrap}>
          <View style={styles.dragPill} />
        </View>

        {/* Header dùng chung chuẩn Apple HIG */}
        <View style={styles.headerWrap}>
          <ModalHeader
            title={track.title}
            subtitle={track.artist}
            onClose={onClose}
            rightElement={
              <View style={styles.headerRightActions}>
                <TouchableOpacity
                  style={styles.posterActionBtn}
                  onPress={() => {
                    Vibration.vibrate(10);
                    const currentLine = lrcLines[activeIndex]?.text || rawLyrics?.split('\n')[0] || '';
                    setSelectedLyricForPoster(currentLine);
                    setPosterModalVisible(true);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={styles.posterActionBtnText}>Poster ✦</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => onOpenEditLyrics(track)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel="Chỉnh sửa lời bài hát"
                >
                  <EditIcon size={13} color={colors.primary} />
                  <Text style={styles.editText}>Edit</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </View>

        {/* Body hiển thị lời */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Đang tải lời bài hát...</Text>
          </View>
        ) : !rawLyrics ? (
          <View style={styles.centerContainer}>
            <View style={styles.emptyIconCircle}>
              <LyricsIcon size={32} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>Chưa có Lyrics</Text>
            <Text style={styles.emptyDesc}>
              Bài hát này chưa có lời đồng bộ. Bạn có thể thêm lời ngay bây giờ để thưởng thức trọn vẹn.
            </Text>
            <TouchableOpacity
              style={styles.addLyricsBtn}
              onPress={() => onOpenEditLyrics(track)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Thêm lời cho bài hát"
            >
              <Text style={styles.addLyricsBtnText}>+ Thêm Lyrics</Text>
            </TouchableOpacity>
          </View>
        ) : isSynced ? (
          /* Danh sách lời đồng bộ thời gian (LRC) phong cách Apple Music & Spotify */
          <ScrollView
            ref={scrollRef}
            style={styles.lyricsScroll}
            contentContainerStyle={styles.lyricsScrollContent}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={handleScrollBegin}
            onMomentumScrollEnd={handleScrollEnd}
            scrollEventThrottle={16}
          >
            {/* Đệm trên để câu đầu tiên xuất hiện ở tầm mắt thoáng */}
            <View style={{ height: LYRICS_TOP_PADDING }} />

            {lrcLines.map((line, idx) => {
              const isActive = idx === activeIndex;
              return (
                <TouchableOpacity
                  key={`line-${idx}-${line.time}`}
                  style={[styles.lyricLineWrap, isActive && styles.lyricLineWrapActive]}
                  activeOpacity={0.7}
                  onLayout={(e) => {
                    lineYOffsets.current[idx] = e.nativeEvent.layout.y;
                  }}
                  onPress={() => {
                    if (onSeek) onSeek(line.time);
                    userScrolledRef.current = false;
                  }}
                  onLongPress={() => {
                    Vibration.vibrate(20);
                    setSelectedLyricForPoster(line.text);
                    setPosterModalVisible(true);
                  }}
                >
                  {renderLineContent(line, idx, isActive)}
                </TouchableOpacity>
              );
            })}

            {/* Đệm dưới rộng rãi để câu cuối cùng có thể cuộn lên giữa màn hình */}
            <View style={{ height: LYRICS_BOTTOM_PADDING }} />
          </ScrollView>
        ) : (
          /* Lời bài hát dạng văn bản thường (plain text) */
          <ScrollView
            style={styles.lyricsScroll}
            contentContainerStyle={styles.plainLyricsContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.plainLyricsBadge}>
              <Text style={styles.plainLyricsBadgeText}>Lời bài hát (văn bản thường)</Text>
            </View>
            <Text style={styles.plainLyricsText}>{rawLyrics}</Text>
            <View style={{ height: 120 }} />
          </ScrollView>
        )}
        <LyricPosterModal
          visible={posterModalVisible}
          onClose={() => setPosterModalVisible(false)}
          initialLyricText={selectedLyricForPoster}
          track={track}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.lyricsBackground,
  },
  dragPillWrap: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  dragPill: {
    width: 38,
    height: 4.5,
    borderRadius: radius.xs,
    backgroundColor: colors.white22,
  },
  headerWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  posterActionBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  posterActionBtnText: {
    color: '#ffffff',
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMutedLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  editText: {
    color: colors.primary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.semibold,
    marginLeft: spacing.xs,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  loadingText: {
    color: colors.textWhite45,
    fontSize: fontSizes.subhead,
    marginTop: spacing.md,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.white5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    marginBottom: spacing.sm,
  },
  emptyDesc: {
    color: colors.textWhite40,
    fontSize: fontSizes.subhead,
    textAlign: 'center',
    lineHeight: lineHeights.body,
    marginBottom: spacing.xxl,
  },
  addLyricsBtn: {
    minHeight: layout.minTouchTarget,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addLyricsBtnText: {
    color: colors.textDark,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
  },
  lyricsScroll: {
    flex: 1,
  },
  lyricsScrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
  },
  lyricLineWrap: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  lyricLineWrapActive: {
    paddingVertical: spacing.lg,
  },
  lyricText: {
    color: colors.textWhite28,
    fontSize: fontSizes.titleLarge,
    lineHeight: lineHeights.headline,
    fontWeight: fontWeights.semibold,
    letterSpacing: -0.3,
  },
  lyricTextPast: {
    color: colors.textWhite40,
    opacity: 0.7,
  },
  lyricTextFuture: {
    color: colors.textWhite28,
    opacity: 0.5,
  },
  lyricTextActive: {
    color: colors.textPrimary,
    fontSize: fontSizes.display,
    lineHeight: lineHeights.huge,
    fontWeight: fontWeights.extrabold,
    letterSpacing: -0.4,
    textShadowColor: colors.white35,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  plainLyricsBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    marginBottom: spacing.lg,
  },
  plainLyricsBadgeText: {
    color: colors.primary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  plainLyricsContent: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxxl,
  },
  plainLyricsText: {
    color: colors.textWhite75,
    fontSize: fontSizes.subheading,
    lineHeight: lineHeights.headline,
    fontWeight: fontWeights.regular,
  },
});
