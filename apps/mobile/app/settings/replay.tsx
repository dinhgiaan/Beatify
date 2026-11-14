import React, { useState, useEffect, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FullReplayReport } from '@music-app/shared';
import { tokens } from '../../src/theme/tokens';
import { statsStorage } from '../../src/services/stats/statsStorage';
import { useLibrary } from '../../src/context';
import { cleanTrackTitle } from '../../src/utils/recentFormatters';
import { STATS_LABELS } from '../../src/constants/labels';
import { ListGroup, SectionHeader } from '../../src/components/common';
import {
  DiscIcon,
  MusicNoteIcon,
  HeadphonesIcon,
  MoonIcon,
  HeartIcon,
  FlameIcon,
  ClockIcon,
  TrophyIcon,
  CheckIcon,
} from '../../src/components/icons/SvgIcons';
import { triggerSelectionHaptic } from '../../src/utils/haptics';

const REPLAY_TABS = [
  { key: 'week', label: 'Tuần này' },
  { key: 'month', label: 'Tháng này' },
  { key: 'year', label: 'Năm nay' },
  { key: 'memories', label: 'Kỷ niệm' },
] as const;

type ReplayTabKey = (typeof REPLAY_TABS)[number]['key'];

function renderMilestoneSvg(id: string, achieved: boolean) {
  const color = achieved ? tokens.colors.accent : tokens.colors.textMuted;
  switch (id) {
    case 'first_track':
      return <MusicNoteIcon size={20} color={color} />;
    case 'listen_10':
    case 'listen_50':
    case 'listen_100':
    case 'listen_500':
      return <HeadphonesIcon size={20} color={color} />;
    case 'night_owl':
      return <MoonIcon size={20} color={color} />;
    case 'loyal_fan':
      return <HeartIcon size={20} color={color} />;
    case 'music_buff':
      return <FlameIcon size={20} color={color} />;
    case 'marathon':
      return <ClockIcon size={20} color={color} />;
    case 'library_builder':
      return <DiscIcon size={20} color={color} />;
    default:
      return <TrophyIcon size={20} color={color} />;
  }
}

export default function ReplayScreen() {
  const insets = useSafeAreaInsets();
  const { tracks } = useLibrary();
  const [report, setReport] = useState<FullReplayReport | null>(null);
  const [activeTab, setActiveTab] = useState<ReplayTabKey>('week');

  const activeTabIdx = REPLAY_TABS.findIndex((t) => t.key === activeTab);
  const activeTabShared = useSharedValue(activeTabIdx >= 0 ? activeTabIdx : 0);
  const barWidthShared = useSharedValue(0);

  useEffect(() => {
    const idx = REPLAY_TABS.findIndex((t) => t.key === activeTab);
    if (idx >= 0) {
      activeTabShared.value = withSpring(idx, {
        damping: 20,
        stiffness: 150,
        mass: 0.7,
      });
    }
  }, [activeTab, activeTabShared]);

  const pillAnimStyle = useAnimatedStyle(() => {
    const total = REPLAY_TABS.length;
    const availableWidth = Math.max(0, barWidthShared.value - 6);
    const itemWidth = total > 0 ? availableWidth / total : 0;
    return {
      width: itemWidth > 0 ? itemWidth : 0,
      transform: [
        {
          translateX: activeTabShared.value * itemWidth,
        },
      ],
      opacity: barWidthShared.value > 0 ? 1 : 0,
    };
  });

  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  useEffect(() => {
    statsStorage.getReplayReport().then(setReport).catch(() => { });
  }, []);

  if (!report) return null;

  const currentPeriodStats =
    activeTab === 'week'
      ? report.week
      : activeTab === 'month'
        ? report.month
        : report.year;

  return (
    <View style={styles.container}>
      {/* SEGMENTED CONTROL TAB BAR VỚI SLIDING ACTIVE PILL */}
      <View style={styles.segmentedContainer}>
        <View
          style={styles.segmentedBar}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0) {
              barWidthShared.value = w;
            }
          }}
        >
          {/* Nền active dạng trượt mượt mà */}
          <Animated.View style={[styles.slidingActivePill, pillAnimStyle]} pointerEvents="none" />

          {REPLAY_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.segmentItem}
                onPress={() => {
                  triggerSelectionHaptic();
                  const idx = REPLAY_TABS.findIndex((t) => t.key === tab.key);
                  if (idx >= 0) {
                    activeTabShared.value = withSpring(idx, {
                      damping: 20,
                      stiffness: 150,
                      mass: 0.7,
                    });
                  }
                  setActiveTab(tab.key);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={[
          styles.scrollInner,
          { paddingBottom: Math.max(insets.bottom, tokens.spacing.xl) + tokens.spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab !== 'memories' ? (
          <>
            {/* TỔNG QUAN KỲ (LƯỢT NGHE & PHÚT NGHE) - THIẾT KẾ CÂN ĐỐI KHÔNG BỊ CHE KHUẤT */}
            <View style={styles.metricBanner}>
              <View style={styles.metricItem}>
                <Text style={styles.metricNumber}>
                  {Math.round(currentPeriodStats.totalMinutes)}
                </Text>
                <Text style={styles.metricLabel}>{STATS_LABELS.MINUTES}</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricNumber}>{currentPeriodStats.totalPlays}</Text>
                <Text style={styles.metricLabel}>{STATS_LABELS.PLAYS}</Text>
              </View>
            </View>

            {/* TOP BÀI HÁT (THÊM ẢNH BÌA expo-image cachePolicy memory-disk) */}
            <SectionHeader
              title={
                activeTab === 'week'
                  ? 'BÀI HÁT NGHE NHIỀU TUẦN NÀY'
                  : activeTab === 'month'
                    ? 'BÀI HÁT NGHE NHIỀU THÁNG NÀY'
                    : 'BÀI HÁT NGHE NHIỀU NĂM NAY'
              }
            />
            <ListGroup>
              {currentPeriodStats.topTracks.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>Chưa có bài hát nào được phát trong kỳ này</Text>
                </View>
              ) : (
                currentPeriodStats.topTracks.map(
                  (
                    t: { trackId: string; title: string; artist: string; count: number; minutes: number },
                    idx: number
                  ) => {
                    const matchedTrack = trackMap.get(t.trackId);
                    const coverUrl = matchedTrack?.cover;

                    return (
                      <View key={t.trackId} style={styles.trackRow}>
                        <Text style={styles.trackIndex}>#{idx + 1}</Text>

                        {/* Thumbnail ảnh bìa nhỏ với expo-image memory-disk */}
                        <View style={styles.thumbWrapper}>
                          {coverUrl ? (
                            <Image
                              source={{ uri: coverUrl }}
                              style={styles.thumbImage}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              transition={150}
                            />
                          ) : (
                            <View style={styles.thumbFallback}>
                              <DiscIcon size={18} color={tokens.colors.textDim} />
                            </View>
                          )}
                        </View>

                        <View style={styles.trackInfo}>
                          <Text style={styles.trackTitle} numberOfLines={2} ellipsizeMode="tail">
                            {cleanTrackTitle(t.title)}
                          </Text>
                          <Text style={styles.trackArtist} numberOfLines={1}>
                            {t.artist}
                          </Text>
                        </View>

                        <View style={styles.trackStatsBadge}>
                          <Text style={styles.trackStatsCount}>
                            {t.count} {STATS_LABELS.PLAYS.toLowerCase()}
                          </Text>
                          <Text style={styles.trackStatsMinutes}>{Math.round(t.minutes)}p</Text>
                        </View>
                      </View>
                    );
                  }
                )
              )}
            </ListGroup>

            {/* NGHỆ SĨ NỔI BẬT */}
            <SectionHeader title="NGHỆ SĨ NỔI BẬT" />
            <ListGroup>
              {currentPeriodStats.topArtists.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>Chưa có dữ liệu nghệ sĩ</Text>
                </View>
              ) : (
                currentPeriodStats.topArtists.map(
                  (a: { artist: string; count: number; minutes: number }, idx: number) => (
                    <View key={a.artist} style={styles.artistRow}>
                      <Text style={styles.artistIndex}>#{idx + 1}</Text>
                      <View style={styles.artistInfo}>
                        <Text style={styles.artistName} numberOfLines={1}>
                          {a.artist}
                        </Text>
                      </View>
                      <Text style={styles.artistCount}>
                        {a.count} {STATS_LABELS.PLAYS.toLowerCase()}
                      </Text>
                    </View>
                  )
                )
              )}
            </ListGroup>
          </>
        ) : (
          /* TAB KỶ NIỆM & CỘT MỐC */
          <>
            <SectionHeader title="DẤU ẤN ĐẦU TIÊN" />
            <ListGroup>
              {report.firstTrackEver ? (
                <View style={styles.memoryBox}>
                  <Text style={styles.memoryTitle} numberOfLines={2} ellipsizeMode="tail">
                    {cleanTrackTitle(report.firstTrackEver.title)}
                  </Text>
                  <Text style={styles.memorySubtitle}>{report.firstTrackEver.artist}</Text>
                  <Text style={styles.memoryDate}>
                    Bài hát mở màn cho kho nhạc vào {report.firstTrackEver.playedAt}
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>Hãy nghe bài hát đầu tiên để lưu dấu ấn</Text>
                </View>
              )}
            </ListGroup>

            <SectionHeader title="BÀI HÁT GẮN BÓ NHẤT" />
            <ListGroup>
              {report.mostPlayedTrackEver ? (
                <View style={styles.memoryBox}>
                  <Text style={styles.memoryTitle} numberOfLines={2} ellipsizeMode="tail">
                    {cleanTrackTitle(report.mostPlayedTrackEver.title)}
                  </Text>
                  <Text style={styles.memorySubtitle}>{report.mostPlayedTrackEver.artist}</Text>
                  <Text style={styles.memoryDate}>
                    Đã đồng hành cùng bạn {report.mostPlayedTrackEver.count} {STATS_LABELS.PLAYS.toLowerCase()}
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>Chưa có bài hát nổi bật</Text>
                </View>
              )}
            </ListGroup>

            <SectionHeader title="CỘT MỐC & THÀNH TỰU" />
            <ListGroup>
              {report.milestones.map((m) => (
                <View key={m.id} style={styles.milestoneRow}>
                  <View style={styles.milestoneIconBox}>
                    {renderMilestoneSvg(m.id, m.achieved)}
                  </View>
                  <View style={styles.milestoneTextCol}>
                    <Text
                      style={[
                        styles.milestoneTitle,
                        !m.achieved && styles.milestoneTitleLocked,
                      ]}
                    >
                      {m.title}
                    </Text>
                    <Text style={styles.milestoneDesc}>{m.desc}</Text>
                  </View>
                  {m.achieved ? (
                    <View style={styles.achievedPill}>
                      <CheckIcon size={12} color={tokens.colors.accent} />
                      <Text style={styles.achievedPillText}>Đạt</Text>
                    </View>
                  ) : (
                    <Text style={styles.lockedPillText}>Chưa mở</Text>
                  )}
                </View>
              ))}
            </ListGroup>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bgBase,
  },
  segmentedContainer: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    backgroundColor: tokens.colors.bgBase,
    borderBottomWidth: tokens.hairlineWidth,
    borderBottomColor: tokens.colors.separator,
  },
  segmentedBar: {
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: tokens.colors.bgSurface,
    borderRadius: tokens.radius.pill,
    padding: 3,
  },
  slidingActivePill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    backgroundColor: '#26262c',
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: tokens.radius.pill,
    zIndex: 1,
  },
  segmentItemActive: {
    backgroundColor: tokens.colors.bgElevated,
  },
  segmentText: {
    ...tokens.typography.footnote,
    color: tokens.colors.textMuted,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: tokens.colors.textPrimary,
    fontWeight: '600',
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    paddingTop: tokens.spacing.xs,
  },
  metricBanner: {
    flexDirection: 'row',
    backgroundColor: tokens.colors.bgSurface,
    marginHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.md,
    borderRadius: tokens.radius.card,
    paddingVertical: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    borderWidth: tokens.hairlineWidth,
    borderColor: tokens.colors.separator,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricNumber: {
    ...tokens.typography.largeTitle,
    fontSize: 28,
    fontWeight: '700',
    color: tokens.colors.accent,
  },
  metricLabel: {
    ...tokens.typography.footnote,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  metricDivider: {
    width: tokens.hairlineWidth,
    height: 36,
    backgroundColor: tokens.colors.separator,
  },
  // Track Row with Thumbnail
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm + 2,
    paddingHorizontal: tokens.spacing.md,
  },
  trackIndex: {
    ...tokens.typography.headline,
    fontSize: 14,
    color: tokens.colors.textDim,
    width: 24,
  },
  thumbWrapper: {
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: tokens.colors.bgElevated,
    marginRight: tokens.spacing.sm + 2,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackInfo: {
    flex: 1,
    paddingRight: tokens.spacing.sm,
  },
  trackTitle: {
    ...tokens.typography.body,
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.textPrimary,
  },
  trackArtist: {
    ...tokens.typography.footnote,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  trackStatsBadge: {
    alignItems: 'flex-end',
  },
  trackStatsCount: {
    ...tokens.typography.footnote,
    fontWeight: '600',
    color: tokens.colors.textPrimary,
  },
  trackStatsMinutes: {
    ...tokens.typography.caption,
    color: tokens.colors.textDim,
    marginTop: 1,
  },
  // Artist Row
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
  },
  artistIndex: {
    ...tokens.typography.headline,
    fontSize: 14,
    color: tokens.colors.textDim,
    width: 24,
  },
  artistInfo: {
    flex: 1,
  },
  artistName: {
    ...tokens.typography.body,
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.textPrimary,
  },
  artistCount: {
    ...tokens.typography.footnote,
    color: tokens.colors.textSecondary,
    fontWeight: '500',
  },
  // Memories
  memoryBox: {
    padding: tokens.spacing.lg,
  },
  memoryTitle: {
    ...tokens.typography.headline,
    fontSize: 16,
  },
  memorySubtitle: {
    ...tokens.typography.footnote,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  memoryDate: {
    ...tokens.typography.caption,
    color: tokens.colors.textDim,
    marginTop: tokens.spacing.xs,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
  },
  milestoneIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: tokens.spacing.md,
  },
  milestoneTextCol: {
    flex: 1,
    paddingRight: tokens.spacing.sm,
  },
  milestoneTitle: {
    ...tokens.typography.body,
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.textPrimary,
  },
  milestoneTitleLocked: {
    color: tokens.colors.textMuted,
  },
  milestoneDesc: {
    ...tokens.typography.footnote,
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  achievedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentMuted,
  },
  achievedPillText: {
    ...tokens.typography.caption,
    color: tokens.colors.accent,
    fontWeight: '600',
  },
  lockedPillText: {
    ...tokens.typography.caption,
    color: tokens.colors.textDim,
  },
  emptyBox: {
    padding: tokens.spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...tokens.typography.footnote,
    color: tokens.colors.textMuted,
    textAlign: 'center',
  },
});

