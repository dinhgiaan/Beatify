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

const LINE_HEIGHT = 58;

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

  // Tìm chỉ số dòng đang phát
  const activeIndex = useMemo(() => {
    if (!isSynced) return -1;
    return findActiveLrcIndex(lrcLines, currentTimeSec);
  }, [isSynced, lrcLines, currentTimeSec]);

  // Tự động cuộn theo dòng phát bám sát vị trí pixel thực tế của câu hát
  useEffect(() => {
    if (visible && isSynced && activeIndex >= 0 && !userScrolledRef.current) {
      const realY = lineYOffsets.current[activeIndex];
      const targetY = typeof realY === 'number'
        ? Math.max(0, realY - 140)
        : Math.max(0, activeIndex * LINE_HEIGHT - 120);
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

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose} activeOpacity={0.7}>
            <CloseIcon size={22} color="#ffffff" />
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
            <EditIcon size={16} color="#1DB954" />
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Body hiển thị lời */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#1DB954" />
            <Text style={styles.loadingText}>Đang tải lời bài hát từ máy chủ...</Text>
          </View>
        ) : !rawLyrics ? (
          <View style={styles.centerContainer}>
            <View style={styles.emptyIconBg}>
              <LyricsIcon size={40} color="#71717a" />
            </View>
            <Text style={styles.emptyTitle}>Chưa có Lyrics</Text>
            <Text style={styles.emptyDesc}>
              Bài hát này hiện chưa có lời trên hệ thống. Bạn có thể thêm lời bài hát ngay bây giờ.
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
          /* Danh sách lời đồng bộ thời gian (LRC) */
          <ScrollView
            ref={scrollRef}
            style={styles.lyricsScroll}
            contentContainerStyle={styles.lyricsScrollContent}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={handleScrollBegin}
            onMomentumScrollEnd={handleScrollEnd}
            scrollEventThrottle={16}
          >
            <View style={{ height: 60 }} />
            {lrcLines.map((line, idx) => {
              const isActive = idx === activeIndex;
              return (
                <TouchableOpacity
                  key={`line-${idx}-${line.time}`}
                  style={[styles.lyricLineWrap, isActive && styles.lyricLineWrapActive]}
                  activeOpacity={0.6}
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
            <View style={{ height: 260 }} />
          </ScrollView>
        ) : (
          /* Lời bài hát dạng văn bản thường (plain text) */
          <ScrollView
            style={styles.lyricsScroll}
            contentContainerStyle={styles.plainLyricsContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.plainLyricsText}>{rawLyrics}</Text>
            <View style={{ height: 100 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0d0e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#22252a',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1b1d22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'center',
  },
  trackTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  trackArtist: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16221a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e3825',
  },
  editText: {
    color: '#1DB954',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 5,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 14,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1b1d22',
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
    color: '#71717a',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  addLyricsBtn: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
  },
  addLyricsBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  lyricsScroll: {
    flex: 1,
  },
  lyricsScrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  lyricLineWrap: {
    minHeight: LINE_HEIGHT,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  lyricLineWrapActive: {
    backgroundColor: '#18241b',
  },
  lyricText: {
    color: '#52525b',
    fontSize: 19,
    lineHeight: 28,
    fontWeight: '600',
    textAlign: 'left',
  },
  lyricTextActive: {
    color: '#ffffff',
    fontSize: 24,
    lineHeight: 34,
    fontWeight: '800',
    textShadowColor: 'rgba(29, 185, 84, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  plainLyricsContent: {
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  plainLyricsText: {
    color: '#d4d4d8',
    fontSize: 16,
    lineHeight: 28,
    fontWeight: '500',
  },
});
