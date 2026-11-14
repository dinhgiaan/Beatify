import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UserProfile, FullReplayReport } from '@music-app/shared';
import { tokens } from '../../src/theme/tokens';
import { statsStorage } from '../../src/services/stats/statsStorage';
import { useLibrary, usePlayer, useOffline } from '../../src/context';
import { formatBytes } from '../../src/services/offline/offlineStorage';
import { STATS_LABELS } from '../../src/constants/labels';
import {
  UserAvatar,
  ListGroup,
  SectionHeader,
  SettingRow,
} from '../../src/components/common';
import {
  ProfileIcon,
  TrophyIcon,
  DiscIcon,
  DownloadIcon,
  MysteryIcon,
} from '../../src/components/icons/SvgIcons';
import { triggerSelectionHaptic } from '../../src/utils/haptics';

export default function SettingsMainScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { totalSizeBytes } = useOffline();
  const { transitionSettings } = usePlayer();
  const { tracks } = useLibrary();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [replayReport, setReplayReport] = useState<FullReplayReport | null>(null);

  useEffect(() => {
    statsStorage.loadUserProfile().then(setUserProfile).catch(() => {});
    statsStorage.getReplayReport().then(setReplayReport).catch(() => {});
  }, []);

  const totalPlays = replayReport?.allTime.totalPlays || 0;
  const totalMinutes = Math.round(replayReport?.allTime.totalMinutes || 0);

  // Tính tiến độ Level tới level kế tiếp (1 -> 2: 50 plays; 2 -> 3: 200 plays; 3 -> 4: 500 plays)
  const currentLevel = replayReport?.streetRank.level || 1;
  const currentTitle = replayReport?.streetRank.title || 'Rookie Rhymer';

  let progressPercent = 100;
  let nextLevelText = 'Cấp tối đa';

  if (currentLevel === 1) {
    progressPercent = Math.min(100, Math.round((totalPlays / 50) * 100));
    nextLevelText = `${totalPlays}/50 lượt nghe tới LV.2`;
  } else if (currentLevel === 2) {
    const progress = totalPlays - 50;
    progressPercent = Math.min(100, Math.round((progress / 150) * 100));
    nextLevelText = `${totalPlays}/200 lượt nghe tới LV.3`;
  } else if (currentLevel === 3) {
    const progress = totalPlays - 200;
    progressPercent = Math.min(100, Math.round((progress / 300) * 100));
    nextLevelText = `${totalPlays}/500 lượt nghe tới LV.4`;
  }

  const navigateTo = (path: string) => {
    triggerSelectionHaptic();
    router.push(path as never);
  };

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.scrollInner,
        { paddingBottom: Math.max(insets.bottom, tokens.spacing.xl) + tokens.spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* THẺ HỒ SƠ TÓM TẮT & THANH TIẾN ĐỘ LEVEL */}
      <View style={styles.profileHeroCard}>
        <TouchableOpacity
          style={styles.profileHeroTouch}
          onPress={() => navigateTo('/settings/profile')}
          activeOpacity={0.7}
        >
          <UserAvatar
            avatarUri={userProfile?.avatarUri}
            displayName={userProfile?.displayName || 'Người Yêu Nhạc'}
            size={64}
          />
          <View style={styles.profileHeroTextCol}>
            <View style={styles.profileHeroHeaderRow}>
              <Text style={styles.profileHeroName} numberOfLines={1}>
                {userProfile?.displayName || 'Người Yêu Nhạc'}
              </Text>
              <Text style={styles.chevron}>›</Text>
            </View>

            {Boolean(userProfile?.bio) && (
              <Text style={styles.profileHeroBio} numberOfLines={1}>
                {userProfile?.bio}
              </Text>
            )}

            {/* Cấp bậc & Thanh tiến độ tới level kế */}
            <View style={styles.levelProgressContainer}>
              <View style={styles.levelTitleRow}>
                <Text style={styles.levelBadgeText}>LV.{currentLevel} · {currentTitle}</Text>
                <Text style={styles.levelProgressLabel}>{nextLevelText}</Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* 2 SỐ LIỆU CHÍNH TÓM TẮT (LƯỢT NGHE & PHÚT NGHE) */}
        <View style={styles.heroStatsRow}>
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatValue}>{totalPlays}</Text>
            <Text style={styles.heroStatLabel}>{STATS_LABELS.PLAYS}</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatValue}>{totalMinutes}</Text>
            <Text style={styles.heroStatLabel}>{STATS_LABELS.MINUTES}</Text>
          </View>
        </View>
      </View>

      {/* DANH SÁCH CÁC NHÓM CÀI ĐẶT GROUPED LIST (iOS SETTINGS) */}
      <SectionHeader title="TÙY CHỌN ỨNG DỤNG" />
      <ListGroup>
        <SettingRow
          label="Hồ sơ"
          description="Tên, ảnh đại diện và giới thiệu"
          icon={<ProfileIcon size={20} color={tokens.colors.accent} />}
          showChevron
          onPress={() => navigateTo('/settings/profile')}
        />

        <SettingRow
          label="Thống kê Replay"
          description="Theo tuần, tháng, năm và kỷ niệm"
          icon={<TrophyIcon size={20} color="#fbbf24" />}
          value={`${totalPlays} lượt`}
          showChevron
          onPress={() => navigateTo('/settings/replay')}
        />

        <SettingRow
          label="Phát nhạc"
          description="Đĩa than Vinyl 360°, Chuyển bài thông minh"
          icon={<DiscIcon size={20} color="#60a5fa" />}
          value={transitionSettings.enabled ? `${transitionSettings.durationSec}s fade` : 'Tắt'}
          showChevron
          onPress={() => navigateTo('/settings/playback')}
        />

        <SettingRow
          label="Lưu trữ & Lịch sử"
          description="Nhạc offline, lịch sử nghe gần đây"
          icon={<DownloadIcon size={20} color={tokens.colors.accent} />}
          value={formatBytes(totalSizeBytes)}
          showChevron
          onPress={() => navigateTo('/settings/storage')}
        />

        <SettingRow
          label="Nâng cao"
          description="Cloudflare Worker, ETag, Nhật ký chuyển bài"
          icon={<MysteryIcon size={20} color={tokens.colors.textSecondary} />}
          showChevron
          onPress={() => navigateTo('/settings/advanced')}
        />
      </ListGroup>

      {/* FOOTER THÔNG TIN APP */}
      <View style={styles.footerBox}>
        <Text style={styles.footerText}>Beatify · {tracks.length} bài hát trong kho</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bgBase,
  },
  scrollInner: {
    paddingTop: tokens.spacing.sm,
  },
  // Profile Hero Card
  profileHeroCard: {
    backgroundColor: tokens.colors.bgSurface,
    marginHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.sm,
    borderRadius: tokens.radius.card,
    overflow: 'hidden',
  },
  profileHeroTouch: {
    flexDirection: 'row',
    padding: tokens.spacing.lg,
    alignItems: 'center',
  },
  profileHeroTextCol: {
    flex: 1,
    marginLeft: tokens.spacing.lg,
  },
  profileHeroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileHeroName: {
    ...tokens.typography.headline,
    fontSize: 18,
    flex: 1,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '600',
    color: tokens.colors.textDim,
    marginLeft: tokens.spacing.xs,
  },
  profileHeroBio: {
    ...tokens.typography.footnote,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  // Level Progress Bar
  levelProgressContainer: {
    marginTop: tokens.spacing.sm,
  },
  levelTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  levelBadgeText: {
    ...tokens.typography.caption,
    fontWeight: '700',
    color: tokens.colors.accent,
  },
  levelProgressLabel: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    fontSize: 11,
  },
  progressBarTrack: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: tokens.colors.bgElevated,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: tokens.colors.accent,
    borderRadius: 2.5,
  },
  // 2 Hero Stats
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: tokens.hairlineWidth,
    borderTopColor: tokens.colors.separator,
    paddingVertical: tokens.spacing.md,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    ...tokens.typography.title3,
    fontSize: 20,
    fontWeight: '700',
    color: tokens.colors.textPrimary,
  },
  heroStatLabel: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  heroStatDivider: {
    width: tokens.hairlineWidth,
    height: 28,
    backgroundColor: tokens.colors.separator,
  },
  footerBox: {
    marginTop: tokens.spacing.xl,
    paddingHorizontal: tokens.spacing.lg,
    alignItems: 'center',
  },
  footerText: {
    ...tokens.typography.caption,
    color: tokens.colors.textDim,
  },
});

