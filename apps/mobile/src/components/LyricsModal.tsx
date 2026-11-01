import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import type { Track } from '@music-app/shared';
import { parseLrc, findActiveLrcIndex, type LrcLine } from '@music-app/shared';
import { CloseIcon, EditIcon, LyricsIcon } from './icons/SvgIcons';

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
  const scrollRef = useRef<ScrollView>(null);
  const userScrolledRef = useRef(false);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineYOffsets = useRef<{ [index: number]: number }>({});

  // Nạp lời bài hát khi mở modal hoặc đổi bài
  useEffect(() => {
    if (visible && track) {
      setIsLoading(true);
      userScrolledRef.current = false;
      lineYOffsets.current = {};
      onFetchLyrics(track.id)
        .then((content) => {
          setRawLyrics(content);
        })
        .catch((err) => {
          console.warn('Không tải được lời bài hát:', err);
          setRawLyrics(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setRawLyrics(null);
      lineYOffsets.current = {};
    }
  }, [visible, track, onFetchLyrics]);

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

  // Tự động cuộn theo dòng phát bám sát vị trí pixel thực tế của câu hát
  useEffect(() => {
    if (visible && isSynced && activeIndex >= 0 && !userScrolledRef.current) {
      const realY = lineYOffsets.current[activeIndex];
      const targetY =
        typeof realY === 'number'
          ? Math.max(0, realY - 140)
          : Math.max(0, activeIndex * DEFAULT_LINE_HEIGHT - 140);
      scrollRef.current?.scrollTo({ y: targetY, animated: true });
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

  if (!track) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Thanh gạt kéo xuống chuẩn iOS (Pill handle) */}
        <View style={styles.dragPillWrap}>
          <View style={styles.dragPill} />
        </View>

        {/* Header tối giản, thanh lịch không đường kẻ thô */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <CloseIcon size={18} color="rgba(255, 255, 255, 0.85)" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.trackTitle} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={styles.trackArtist} numberOfLines={1}>
              {track.artist} {isSynced ? '• Synced Lyrics' : ''}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => onOpenEditLyrics(track)}
            activeOpacity={0.7}
          >
            <EditIcon size={13} color="#1DB954" />
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Body hiển thị lời */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color="#1DB954" />
            <Text style={styles.loadingText}>Đang tải lời bài hát...</Text>
          </View>
        ) : !rawLyrics ? (
          <View style={styles.centerContainer}>
            <View style={styles.emptyIconCircle}>
              <LyricsIcon size={32} color="#71717a" />
            </View>
            <Text style={styles.emptyTitle}>Chưa có Lyrics</Text>
            <Text style={styles.emptyDesc}>
              Bài hát này chưa có lời đồng bộ. Bạn có thể thêm lời ngay bây giờ để thưởng thức trọn vẹn.
            </Text>
            <TouchableOpacity
              style={styles.addLyricsBtn}
              onPress={() => onOpenEditLyrics(track)}
              activeOpacity={0.8}
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
            <View style={{ height: 60 }} />

            {lrcLines.map((line, idx) => {
              const isActive = idx === activeIndex;
              return (
                <TouchableOpacity
                  key={`line-${idx}-${line.time}`}
                  style={styles.lyricLineWrap}
                  activeOpacity={0.7}
                  onLayout={(e) => {
                    lineYOffsets.current[idx] = e.nativeEvent.layout.y;
                  }}
                  onPress={() => {
                    if (onSeek) onSeek(line.time);
                    userScrolledRef.current = false;
                  }}
                >
                  <Text style={[styles.lyricText, isActive && styles.lyricTextActive]}>
                    {line.text || '♪'}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Đệm dưới rộng rãi để câu cuối cùng có thể cuộn lên giữa màn hình */}
            <View style={{ height: 320 }} />
          </ScrollView>
        ) : (
          /* Lời bài hát dạng văn bản thường (plain text) */
          <ScrollView
            style={styles.lyricsScroll}
            contentContainerStyle={styles.plainLyricsContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.plainLyricsText}>{rawLyrics}</Text>
            <View style={{ height: 120 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0b0e',
  },
  dragPillWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  dragPill: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: 14,
    alignItems: 'center',
  },
  trackTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  trackArtist: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
  },
  editText: {
    color: '#1DB954',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 36,
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 13,
    marginTop: 12,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyDesc: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  addLyricsBtn: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  addLyricsBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
  lyricsScroll: {
    flex: 1,
  },
  lyricsScrollContent: {
    paddingHorizontal: 26,
    paddingVertical: 10,
  },
  lyricLineWrap: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  lyricText: {
    color: 'rgba(255, 255, 255, 0.28)',
    fontSize: 20,
    lineHeight: 30,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  lyricTextActive: {
    color: '#ffffff',
    fontSize: 26,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(255, 255, 255, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  plainLyricsContent: {
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  plainLyricsText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 16,
    lineHeight: 30,
    fontWeight: '400',
  },
});
