import React, { useState, useEffect, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
  FadeInDown,
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
  ProfileIcon,
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
  const screenWidth = Dimensions.get('window').width;
  const barWidthShared = useSharedValue(Math.max(screenWidth - 32, 300));

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
          <Animated.View key={activeTab} entering={FadeIn.duration(240)} style={{ flex: 1 }}>
            {/* TỔNG QUAN KỲ (LƯỢT NGHE & PHÚT NGHE) - THIẾT KẾ CÂN ĐỐI KHÔNG BỊ CHE KHUẤT */}
            <View style={styles.metricBanner}>
              <View style={styles.metricItem}>
                <View style={styles.metricHeaderRow}>
                  <ClockIcon size={16} color={tokens.colors.accent} />
                  <Text style={styles.metricLabel}>{STATS_LABELS.MINUTES}</Text>
                </View>
                <Text style={styles.metricNumber}>
                  {Math.round(currentPeriodStats.totalMinutes)}
                </Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <View style={styles.metricHeaderRow}>
                  <HeadphonesIcon size={16} color={tokens.colors.accent} />
                  <Text style={styles.metricLabel}>{STATS_LABELS.PLAYS}</Text>
                </View>
                <Text style={styles.metricNumber}>{currentPeriodStats.totalPlays}</Text>
              </View>
            </View>

            {/* TOP BÀI HÁT (THÊM ẢNH BÌA expo-image cachePolicy memory-disk) */}
            <View style={styles.sectionBlock}>
              <SectionHeader
                title={
                  activeTab === 'week'
                    ? 'BÀI HÁT NGHE NHIỀU TUẦN NÀY'
                    : activeTab === 'month'
                      ? 'BÀI HÁT NGHE NHIỀU THÁNG NAY'
                      : 'BÀI HÁT NGHE NHIỀU NĂM NAY'
                }
                variant="list"
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
                      const rankStyle =
                        idx === 0
                          ? styles.rankGold
                          : idx === 1
                            ? styles.rankSilver
                            : idx === 2
                              ? styles.rankBronze
                              : styles.rankNormal;

                      return (
                        <Animated.View
                          key={t.trackId}
                          entering={FadeInDown.duration(260).delay(idx * 30).springify().damping(18)}
                          style={styles.trackRow}
                        >
                          <View style={[styles.rankBadge, rankStyle]}>
                            <Text style={[styles.trackIndex, idx < 3 && styles.trackIndexTop]}>
                              {idx + 1}
                            </Text>
                          </View>

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
                            <Text style={styles.trackTitle} numberOfLines={1} ellipsizeMode="tail">
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
                            <Text style={styles.trackStatsMinutes}>{Math.round(t.minutes)} phút</Text>
                          </View>
                        </Animated.View>
                      );
                    }
                  )
                )}
              </ListGroup>
            </View>

            {/* NGHỆ SĨ NỔI BẬT */}
            <View style={[styles.sectionBlock, styles.sectionSpaced]}>
              <SectionHeader title="NGHỆ SĨ NỔI BẬT" variant="list" />
              <ListGroup>
                {currentPeriodStats.topArtists.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>Chưa có dữ liệu nghệ sĩ</Text>
                  </View>
                ) : (
                  currentPeriodStats.topArtists.map(
                    (a: { artist: string; count: number; minutes: number }, idx: number) => {
                      const rankStyle =
                        idx === 0
                          ? styles.rankGold
                          : idx === 1
                            ? styles.rankSilver
                            : idx === 2
                              ? styles.rankBronze
                              : styles.rankNormal;

                      return (
                        <Animated.View
                          key={a.artist}
                          entering={FadeInDown.duration(260).delay(idx * 30).springify().damping(18)}
                          style={styles.artistRow}
                        >
                          <View style={[styles.rankBadge, rankStyle]}>
                            <Text style={[styles.artistIndex, idx < 3 && styles.artistIndexTop]}>
                              {idx + 1}
                            </Text>
                          </View>
                          <View style={styles.artistAvatar}>
                            <ProfileIcon size={18} color={tokens.colors.textSecondary} />
                          </View>
                          <View style={styles.artistInfo}>
                            <Text style={styles.artistName} numberOfLines={1}>
                              {a.artist}
                            </Text>
                            <Text style={styles.artistRankLabel}>Top {idx + 1} nổi bật</Text>
                          </View>
                          <View style={styles.trackStatsBadge}>
                            <Text style={styles.trackStatsCount}>
                              {a.count} {STATS_LABELS.PLAYS.toLowerCase()}
                            </Text>
                            <Text style={styles.trackStatsMinutes}>{Math.round(a.minutes)} phút</Text>
                          </View>
                        </Animated.View>
                      );
                    }
                  )
                )}
              </ListGroup>
            </View>
          </Animated.View>
        ) : (
          /* TAB KỶ NIỆM & CỘT MỐC */
          <Animated.View key={activeTab} entering={FadeIn.duration(240)} style={{ flex: 1 }}>
            <View style={styles.sectionBlock}>
              <SectionHeader title="DẤU ẤN ĐẦU TIÊN" variant="list" />
              <ListGroup>
                {report.firstTrackEver ? (
                  <Animated.View
                    entering={FadeInDown.duration(280).delay(40).springify().damping(18)}
                    style={styles.memoryBox}
                  >
                    <View style={styles.memoryIconCircle}>
                      <MusicNoteIcon size={22} color={tokens.colors.accent} />
                    </View>
                    <View style={styles.memoryContent}>
                      <Text style={styles.memoryTitle} numberOfLines={1} ellipsizeMode="tail">
                        {cleanTrackTitle(report.firstTrackEver.title)}
                      </Text>
                      <Text style={styles.memorySubtitle}>{report.firstTrackEver.artist}</Text>
                      <Text style={styles.memoryDate}>
                        Bài hát mở màn cho kho nhạc vào {report.firstTrackEver.playedAt}
                      </Text>
                    </View>
                  </Animated.View>
                ) : (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>Hãy nghe bài hát đầu tiên để lưu dấu ấn</Text>
                  </View>
                )}
              </ListGroup>
            </View>

            <View style={[styles.sectionBlock, styles.sectionSpaced]}>
              <SectionHeader title="BÀI HÁT GẮN BÓ NHẤT" variant="list" />
              <ListGroup>
                {report.mostPlayedTrackEver ? (
                  <Animated.View
                    entering={FadeInDown.duration(280).delay(80).springify().damping(18)}
                    style={styles.memoryBox}
                  >
                    <View style={[styles.memoryIconCircle, { backgroundColor: 'rgba(244, 63, 94, 0.14)' }]}>
                      <HeartIcon size={22} color="#f43f5e" fill="#f43f5e" />
                    </View>
                    <View style={styles.memoryContent}>
                      <Text style={styles.memoryTitle} numberOfLines={1} ellipsizeMode="tail">
                        {cleanTrackTitle(report.mostPlayedTrackEver.title)}
                      </Text>
                      <Text style={styles.memorySubtitle}>{report.mostPlayedTrackEver.artist}</Text>
                      <Text style={styles.memoryDate}>
                        Đã đồng hành cùng bạn {report.mostPlayedTrackEver.count} {STATS_LABELS.PLAYS.toLowerCase()}
                      </Text>
                    </View>
                  </Animated.View>
                ) : (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>Chưa có bài hát nổi bật</Text>
                  </View>
                )}
              </ListGroup>
            </View>

            <View style={[styles.sectionBlock, styles.sectionSpaced]}>
              <SectionHeader title="CỘT MỐC & THÀNH TỰU" variant="list" />
              <ListGroup>
                {report.milestones.map((m, idx) => (
                  <Animated.View
                    key={m.id}
                    entering={FadeInDown.duration(260).delay(idx * 30).springify().damping(18)}
                    style={styles.milestoneRow}
                  >
                    <View style={[styles.milestoneIconBox, m.achieved && styles.milestoneIconBoxAchieved]}>
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
                      <View style={styles.lockedPill}>
                        <Text style={styles.lockedPillText}>Chưa mở</Text>
                      </View>
                    )}
                  </Animated.View>
                ))}
              </ListGroup>
            </View>
          </Animated.View>
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
  sectionBlock: {},
  sectionSpaced: {
    marginTop: 26,
  },
  metricBanner: {
    flexDirection: 'row',
    backgroundColor: tokens.colors.bgSurface,
    marginHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.md,
    marginBottom: 24,
    borderRadius: tokens.radius.card,
    paddingVertical: 18,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
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
    paddingVertical: 12,
    paddingHorizontal: tokens.spacing.lg,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: tokens.spacing.xs + 2,
  },
  rankGold: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  rankSilver: {
    backgroundColor: 'rgba(226, 232, 240, 0.16)',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rankBronze: {
    backgroundColor: 'rgba(217, 119, 6, 0.16)',
    borderWidth: 1,
    borderColor: '#d97706',
  },
  rankNormal: {
    backgroundColor: 'transparent',
  },
  trackIndex: {
    ...tokens.typography.headline,
    fontSize: 13,
    color: tokens.colors.textDim,
    textAlign: 'center',
  },
  trackIndexTop: {
    fontWeight: '700',
    color: tokens.colors.textPrimary,
  },
  thumbWrapper: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: tokens.colors.bgElevated,
    marginRight: 12,
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
    lineHeight: 20,
  },
  trackArtist: {
    ...tokens.typography.footnote,
    color: tokens.colors.textSecondary,
    marginTop: 3,
  },
  trackStatsBadge: {
    alignItems: 'flex-end',
    minWidth: 68,
  },
  trackStatsCount: {
    ...tokens.typography.footnote,
    fontWeight: '600',
    color: tokens.colors.textPrimary,
  },
  trackStatsMinutes: {
    ...tokens.typography.caption,
    color: tokens.colors.textDim,
    marginTop: 2,
  },
  // Artist Row
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: tokens.spacing.lg,
  },
  artistAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  artistIndex: {
    ...tokens.typography.headline,
    fontSize: 13,
    color: tokens.colors.textDim,
    textAlign: 'center',
  },
  artistIndexTop: {
    fontWeight: '700',
    color: tokens.colors.textPrimary,
  },
  artistInfo: {
    flex: 1,
    paddingLeft: tokens.spacing.xs,
  },
  artistName: {
    ...tokens.typography.body,
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.textPrimary,
  },
  artistRankLabel: {
    ...tokens.typography.caption,
    color: tokens.colors.textDim,
    marginTop: 2,
  },
  artistCount: {
    ...tokens.typography.footnote,
    color: tokens.colors.textSecondary,
    fontWeight: '500',
  },
  // Memories
  memoryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
  },
  memoryIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: tokens.colors.accentMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  memoryContent: {
    flex: 1,
  },
  memoryTitle: {
    ...tokens.typography.headline,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  memorySubtitle: {
    ...tokens.typography.footnote,
    color: tokens.colors.textSecondary,
    marginTop: 4,
  },
  memoryDate: {
    ...tokens.typography.caption,
    color: tokens.colors.textDim,
    marginTop: 6,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: tokens.spacing.lg,
  },
  milestoneIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: tokens.colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  milestoneIconBoxAchieved: {
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
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
    marginTop: 3,
    lineHeight: 18,
  },
  achievedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentMuted,
  },
  achievedPillText: {
    ...tokens.typography.caption,
    color: tokens.colors.accent,
    fontWeight: '600',
  },
  lockedPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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

