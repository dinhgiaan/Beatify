import React, { useState, useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UserProfile, FullReplayReport } from '@music-app/shared';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { tokens } from '../theme/tokens';
import { useLibrary, usePlayer, useOffline } from '../context';
import { statsStorage } from '../services/stats/statsStorage';
import { ProfileModal } from './ProfileModal';
import { OfflineDownloadsModal } from './OfflineDownloadsModal';
import { TransitionLogModal } from './TransitionLogModal';
import { formatBytes } from '../services/offline/offlineStorage';
import { CloseIcon, CheckIcon } from './icons/SvgIcons';
import {
ListGroup,
  SectionHeader,
  SettingRow,
  UserAvatar,
} from './common';
import { STATS_LABELS } from '../constants/labels';
import { triggerSelectionHaptic } from '../utils/haptics';

interface HiddenSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onProfileUpdated?: (profile: UserProfile) => void;
}

export function HiddenSettingsModal({ visible, onClose, onProfileUpdated }: HiddenSettingsModalProps) {
  const insets = useSafeAreaInsets();
  const {
    tracks,
    serverUrl,
    setServerUrl,
    serverToken,
    setServerToken,
    isSyncing,
    syncStatus,
    expirationDate,
    lastSyncTime,
    currentEtag,
    lastSyncError,
    syncLibrary,
    clearLibraryCache,
  } = useLibrary();

  const {
    gaplessDeltaMs,
    atomicWriteBranch,
    lastMoveError,
    recoveryStatus,
    writeQueueStatus,
    addCustomTrack,
    recentLimit,
    setRecentLimit,
    clearRecentTracks,
    isVinylMode,
    toggleVinylMode,
    transitionSettings,
    updateTransitionSettings,
  } = usePlayer();

  const { offlineTracks, totalSizeBytes, clearAllOffline } = useOffline();

  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [inputToken, setInputToken] = useState(serverToken);
  const [showToken, setShowToken] = useState(false);
  const [customAudioUrl, setCustomAudioUrl] = useState('');
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileInitialEditing, setProfileInitialEditing] = useState(false);
  const [offlineModalVisible, setOfflineModalVisible] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [transitionLogModalVisible, setTransitionLogModalVisible] = useState(false);
  const [isDevSettingsOpen, setIsDevSettingsOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [replayReport, setReplayReport] = useState<FullReplayReport | null>(null);
  const [isDevSettingsOpen, setIsDevSettingsOpen] = useState(false);
  const [transitionLogModalVisible, setTransitionLogModalVisible] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => {
    if (visible) {
      statsStorage.loadUserProfile().then(setUserProfile).catch(() => { });
      statsStorage.getReplayReport().then(setReplayReport).catch(() => { });
      statsStorage.loadUserProfile().then(setUserProfile).catch(() => { });
      statsStorage.getReplayReport().then(setReplayReport).catch(() => { });
    }
  }, [visible]);

  useEffect(() => {
    setInputUrl(serverUrl);
    setInputToken(serverToken);
  }, [serverUrl, serverToken]);

  const toggleDevSettings = () => {
    Vibration.vibrate(10);
    triggerSelectionHaptic();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDevSettingsOpen((prev) => !prev);
  };

  const buildSha = process.env.EXPO_PUBLIC_BUILD_SHA || 'dev-local';

  const handleSaveConfig = () => {
    Vibration.vibrate(10);
    triggerSelectionHaptic();
    setIsSavingConfig(true);
    setServerUrl(inputUrl.trim());
    setServerToken(inputToken.trim());
    setTimeout(() => {
      setIsSavingConfig(false);
      Alert.alert('Đã lưu cấu hình', 'Thông tin máy chủ đã được cập nhật thành công!');
    }, 200);
  };

  const handleSyncNow = async () => {
    Vibration.vibrate(10);
    triggerSelectionHaptic();
    await syncLibrary({ silent: false, force: false });
  };

  const handleClearCache = () => {
    Vibration.vibrate(10);
    triggerSelectionHaptic();
    Alert.alert(
      'Xóa bộ nhớ đệm thư viện?',
      'Hành động này sẽ xóa file cache cục bộ trên điện thoại và tải lại toàn bộ danh sách bài hát mới nhất từ Cloudflare R2.',
      'Thao tác này sẽ xóa cache cục bộ và tải lại toàn bộ danh mục bài hát từ Cloudflare R2.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa & Tải lại',
          text: 'Xóa và tải lại',
          style: 'destructive',
          onPress: async () => {
            await clearLibraryCache();
            await syncLibrary({ silent: false, force: true });
          },
        },
      ]
    );
  };

  const handleAddCustomAudio = async () => {
    const trimmed = customAudioUrl.trim();
    if (!trimmed) {
      Alert.alert('Chưa nhập liên kết', 'Vui lòng dán liên kết audio hợp lệ (MP3, AAC, FLAC...)');
      const url = customAudioUrl.trim();
      if (!url) {
        Alert.alert('Chưa nhập liên kết', 'Vui lòng dán liên kết âm thanh trực tiếp (http/https).');
        return;
      }
      Vibration.vibrate(10);
      await addCustomTrack(trimmed);
      setCustomAudioUrl('');
      Alert.alert('Thành công', 'Đã thêm bài hát bí mật vào hàng phát hiện tại!');
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        Alert.alert('Liên kết không hợp lệ', 'Địa chỉ phải bắt đầu bằng http:// hoặc https://');
        return;
      }
      try {
        await addCustomTrack(url);
        setCustomAudioUrl('');
        triggerSelectionHaptic();
        Alert.alert('Thành công', 'Bài hát trực tiếp đã được thêm vào hàng chờ phát!');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Không thể phát liên kết này';
        Alert.alert('Lỗi thêm bài', msg);
      }
    };

    const formatDateTime = (iso: string | null) => {
      if (!iso) return 'Chưa đồng bộ';
      const formatDateTime = (iso?: string | null) => {
        if (!iso) return 'Chưa có';
        try {
          const d = new Date(iso);
          return d.toLocaleString('vi-VN');
        } catch {
          return iso;
        }
      };

      // Tóm tắt chỉ số nghe để không bị lặp grid 4 ô (Lỗi 10)
      const totalPlays = replayReport?.allTime.totalPlays || 0;
      const totalMinutes = Math.round(replayReport?.allTime.totalMinutes || 0);

      return (
        <Modal
          visible={visible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={onClose}
        >
          <View style={[styles.container, { paddingTop: Math.max(insets.top, spacing.md) }]}>
            {/* Header Modal */}
            <View style={styles.container}>
              {/* Grabber indicator chuẩn iOS PageSheet (Lỗi 2) */}
              <View style={styles.grabberBox}>
                <View style={styles.grabber} />
              </View>

              {/* Header Modal phẳng tối giản */}
              <View style={styles.header}>
                <View>
                  <Text style={styles.headerTitle}>Hồ sơ cá nhân & Cài đặt</Text>
                </View>
                <Text style={styles.headerTitle}>Hồ sơ & Cài đặt</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Đóng cài đặt ẩn"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityLabel="Đóng cài đặt"
                >
                  <CloseIcon size={20} color={colors.textPrimary} />
                  <CloseIcon size={18} color={tokens.colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.scrollContent}
                contentContainerStyle={[
                  styles.scrollInner,
                  { paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xl },
                  { paddingBottom: Math.max(insets.bottom, tokens.spacing.xl) + tokens.spacing.xl },
                ]}
                showsVerticalScrollIndicator={false}
              >
                {/* THẺ HỒ SƠ NGƯỜI DÙNG & AVATAR NỔI BẬT */}
                <View style={styles.profileHeaderCard}>
                  {/* MỤC 1: HỒ SƠ NGƯỜI DÙNG & TÓM TẮT THỐNG KÊ (Grouped List) */}
                  <SectionHeader title="HỒ SƠ CÁ NHÂN" />
                  <ListGroup>
                    <TouchableOpacity
                      style={styles.profileHeaderMainTouch}
                      style={styles.profileRow}
                      onPress={() => {
                        Vibration.vibrate(10);
                        triggerSelectionHaptic();
                        setProfileInitialEditing(false);
                        setProfileModalVisible(true);
                      }}
                      activeOpacity={0.8}
                      activeOpacity={0.7}
                      accessibilityLabel="Xem thống kê nghe nhạc và Replay"
                    >
                      <View style={styles.profileAvatarWrapper}>
                        {userProfile?.avatarUri ? (
                          <Image
                            source={{ uri: userProfile.avatarUri }}
                            style={styles.profileAvatarImg}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.profileAvatarPlaceholder}>
                            <ProfileIcon size={28} color={colors.primary} />
                          </View>
                        )}
                      </View>
                      <View style={styles.profileHeaderInfo}>
                        <Text style={styles.profileHeaderName} numberOfLines={1}>
                          <UserAvatar
                            avatarUri={userProfile?.avatarUri}
                            displayName={userProfile?.displayName || 'Người Yêu Nhạc'}
                            size={54}
                          />
                          <View style={styles.profileTextCol}>
                            <Text style={styles.profileName} numberOfLines={1}>
                              {userProfile?.displayName || 'Người Yêu Nhạc'}
                            </Text>
                            <Text style={styles.profileSummary} numberOfLines={1}>
                              {totalPlays} {STATS_LABELS.PLAYS.toLowerCase()} · {totalMinutes} {STATS_LABELS.MINUTES.toLowerCase()}
                            </Text>
                            {Boolean(userProfile?.bio) && (
                  <Text style={styles.profileHeaderBio} numberOfLines={1}>
                  <Text style={styles.profileBio} numberOfLines={1}>
                    {userProfile?.bio}
                  </Text>
                )}
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.profileEditBadge}
            <SettingRow
                            label="Chỉnh sửa hồ sơ"
                            description="Đổi ảnh đại diện, tên hiển thị và giới thiệu ngắn"
                            showChevron
                            onPress={() => {
                              Vibration.vibrate(10);
                              triggerSelectionHaptic();
                              setProfileInitialEditing(true);
                              setProfileModalVisible(true);
                            }}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            activeOpacity={0.7}
                            accessibilityLabel="Chỉnh sửa tên, giới thiệu và ảnh đại diện"
                          >
                            <EditIcon size={16} color={colors.primary} />
                          </TouchableOpacity>
                      </View>
            />
                  </ListGroup>

                  {/* MỤC 1: THỐNG KÊ NGHE NHẠC & REPLAY (HIỂN THỊ TRỰC TIẾP RA NGOÀI) */}
                  <View style={styles.sectionCard}>
                    <View style={styles.mysteryTitleRow}>
                      <TrophyIcon size={20} color={colors.primary} />
                      <Text style={[styles.sectionHeader, { color: colors.primary, marginBottom: 0 }]}>
                        THỐNG KÊ NGHE NHẠC & REPLAY
                      </Text>
                    </View>
                    {/* MỤC 2: TRẢI NGHIỆM PHÁT NHẠC */}
                    <SectionHeader title="TRẢI NGHIỆM PHÁT NHẠC" />
                    <ListGroup>
                      <SettingRow
                        label="Đĩa than Vinyl 360°"
                        description="Cần kim tonearm và hiệu ứng xoay 33⅓ RPM khi đang phát"
                        isSwitch
                        switchValue={isVinylMode}
                        onSwitchChange={toggleVinylMode}
                      />
                    </ListGroup>

                    {/* Cấp bậc Hip-hop đường phố (Street Rank Badge) */}
                    {replayReport?.streetRank && (
                      <View style={styles.streetRankBanner}>
                        <View style={styles.streetRankIconBox}>
                          <Text style={styles.streetRankEmoji}>{replayReport.streetRank.badge}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.streetRankTitleRow}>
                            <Text style={styles.streetRankTitle}>{replayReport.streetRank.title}</Text>
                            <View style={styles.streetRankLevelBadge}>
                              <Text style={styles.streetRankLevelText}>LV.{replayReport.streetRank.level}</Text>
                            </View>
                          </View>
                          <Text style={styles.streetRankDesc}>{replayReport.streetRank.description}</Text>
                        </View>
                      </View>
                    )}
                    {/* MỤC 3: CHUYỂN BÀI THÔNG MINH (SMART TRANSITION) */}
                    <SectionHeader
                      title="CHUYỂN BÀI THÔNG MINH"
                      subtitle="Tự động hòa âm và fade âm lượng mượt mà giữa hai bài hát"
                    />
                    <ListGroup>
                      <SettingRow
                        label="Kích hoạt chuyển bài"
                        description="Hòa âm mượt giữa bài cũ và bài mới"
                        isSwitch
                        switchValue={transitionSettings.enabled}
                        onSwitchChange={(val) => updateTransitionSettings({ enabled: val })}
                      />

                      {/* Grid 4 chỉ số thống kê nổi bật */}
                      <View style={styles.statsGrid}>
                        <View style={styles.statTile}>
                          <HeadphonesIcon size={20} color={colors.primary} />
                          <Text style={styles.statTileValue}>
                            {Math.round(replayReport?.allTime.totalMinutes || 0)}
                            {/* CHIP THỜI GIAN CHUYỂN BÀI: Luôn hiện, mờ đi khi Switch tắt (Lỗi 7 & Lỗi 9) */}
                            <View
                              style={[
                                styles.durationRowContainer,
                                !transitionSettings.enabled && styles.disabledSection,
                              ]}
                            >
                              <View style={styles.durationHeader}>
                                <Text style={styles.durationLabel}>Thời gian chuyển bài</Text>
                                <Text style={styles.durationSubLabel}>
                                  Hòa âm mượt mà giữa hai bài hát liên tiếp
                                </Text>
                                <Text style={styles.statTileLabel}>Phút nghe</Text>
                              </View>

                              <View style={styles.statTile}>
                                <MusicNoteIcon size={20} color={colors.primary} />
                                <Text style={styles.statTileValue}>
                                  {replayReport?.allTime.totalPlays || 0}
                                </Text>
                                <Text style={styles.statTileLabel}>Lượt nghe</Text>
                              </View>

                              <View style={styles.statTile}>
                                <FlameIcon size={20} color="#FF7A00" />
                                <Text style={styles.statTileValue}>
                                  {replayReport?.milestones.filter((m) => m.achieved).length || 0}
                                </Text>
                                <Text style={styles.statTileLabel}>Cột mốc đạt</Text>
                              </View>

                              <View style={styles.statTile}>
                                <DiscIcon size={20} color="#60A5FA" />
                                <Text style={styles.statTileValue}>{tracks.length}</Text>
                                <Text style={styles.statTileLabel}>Kho bài hát</Text>
                              </View>
                            </View>

                            {/* Highlights: Top nghệ sĩ & Top bài hát */}
                            {((replayReport?.allTime.topArtists && replayReport.allTime.topArtists.length > 0) ||
                              (replayReport?.allTime.topTracks && replayReport.allTime.topTracks.length > 0)) && (
                                <View style={styles.topHighlightsBox}>
                                  {replayReport?.allTime.topArtists?.[0] && (
                                    <View style={styles.highlightItem}>
                                      <Text style={styles.highlightLabel}>Nghệ sĩ nghe nhiều nhất</Text>
                                      <Text style={styles.highlightValue} numberOfLines={1}>
                                        👑 {replayReport.allTime.topArtists[0].artist}{' '}
                                        <Text style={styles.highlightCount}>
                                          ({replayReport.allTime.topArtists[0].count} lần)
                                        </Text>
                                        <View style={styles.pillRow}>
                                          {([2, 3, 4, 5, 6, 8] as const).map((dur) => {
                                            const isSelected = transitionSettings.durationSec === dur;
                                            return (
                                              <TouchableOpacity
                                                key={dur}
                                                disabled={!transitionSettings.enabled}
                                                style={[
                                                  styles.pillBtn,
                                                  isSelected && transitionSettings.enabled && styles.pillBtnActive,
                                                ]}
                                                onPress={() => {
                                                  triggerSelectionHaptic();
                                                  updateTransitionSettings({ durationSec: dur });
                                                }}
                                                activeOpacity={0.7}
                                              >
                                                <Text
                                                  style={[
                                                    styles.pillBtnText,
                                                    isSelected && transitionSettings.enabled && styles.pillBtnTextActive,
                                                  ]}
                                                >
                                                  {dur}s
                                                </Text>
                                              </View>
                                            )
                                          }

                  { replayReport?.allTime.topTracks?.[0] && (
                                              <View style={[styles.highlightItem, { marginTop: spacing.xs }]}>
                                                <Text style={styles.highlightLabel}>Bài hát replay nhiều nhất</Text>
                                                <Text style={styles.highlightValue} numberOfLines={1}>
                                                  🔥 {replayReport.allTime.topTracks[0].title}{' '}
                                                  <Text style={styles.highlightCount}>
                                                    ({replayReport.allTime.topTracks[0].count} lần)
                                                  </Text>
                                                </Text>
                                              </View>
                                            )}
                                        </View>
              )}

                                        {/* Nút xem chi tiết cột mốc & chỉnh sửa */}
                                        <TouchableOpacity
                                          style={styles.detailStatsBtn}
                                          onPress={() => {
                                            Vibration.vibrate(10);
                                            setProfileModalVisible(true);
                                          }}
                                          activeOpacity={0.7}
                                        >
                                          <Text style={styles.detailStatsBtnText}>Xem chi tiết cột mốc & chỉnh sửa hồ sơ</Text>
                                          <Text style={styles.chevronText}>→</Text>
                                        </TouchableOpacity>
                                    </View>

          {/* MỤC 2: TRẢI NGHIỆM PHÁT NHẠC (TURNTABLE VINYL & VISUALIZER) */}
                                  <View style={styles.sectionCard}>
                                    <View style={styles.mysteryTitleRow}>
                                      <DiscIcon size={20} color={colors.primary} />
                                      <Text style={[styles.sectionHeader, { color: colors.primary, marginBottom: 0 }]}>
                                        TRẢI NGHIỆM PHÁT NHẠC (TURNTABLE VINYL)
                                      </Text>
                                    </View>
                                    <Text style={styles.sectionDesc}>
                                      Bật chế độ Đĩa Than Vinyl 360° với cần kim tonearm và hiệu ứng xoay 33⅓ RPM trên màn hình đang phát (Now Playing):
                                    </Text>

                                    <View style={styles.rowItem}>
                                      <View style={{ flex: 1 }}>
                                        <Text style={styles.label}>Chế độ Đĩa Than Vinyl</Text>
                                        <Text style={styles.subLabel}>Tự động đồng bộ và lưu trữ trạng thái</Text>
                                      </TouchableOpacity>
                                      );
                })}
                                    </View>
                                    <TouchableOpacity
                                      style={[styles.vinylToggleSwitch, isVinylMode && styles.vinylToggleSwitchActive]}
                                      onPress={toggleVinylMode}
                                      activeOpacity={0.8}
                                    >
                                      <View style={[styles.switchThumb, isVinylMode && styles.switchThumbActive]} />
                                    </TouchableOpacity>
                                  </View>
                                </View>

          {/* CHUYỂN BÀI THÔNG MINH (SMART TRANSITION & HARMONIC MIX) */}
                            <View style={styles.sectionCard}>
                              <View style={styles.sectionHeaderRow}>
                                <Text style={[styles.sectionHeader, { flex: 1, marginBottom: 0 }]}>Chuyển bài thông minh</Text>
                                <View style={styles.streetBadge}>
                                  <Text style={styles.streetBadgeText}>DJ AUTO</Text>
                                </View>
                              </View>
                              <Text style={styles.sectionDesc}>
                                Tự động hòa âm và chuyển bài mượt mà giữa các bài hát.
                              </Text>
                              <SettingRow
                                label="Chế độ an toàn (Safe Mode)"
                                description="Giữ ổn định khi nghe nhạc trên màn hình khóa"
                                isSwitch
                                disabled={!transitionSettings.enabled}
                                switchValue={transitionSettings.safeMode}
                                onSwitchChange={(val) => updateTransitionSettings({ safeMode: val })}
                              />

                              {/* BẬT / TẮT CHÍNH */}
                              <View style={styles.rowItem}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.label}>Kích hoạt chuyển bài</Text>
                                  <Text style={styles.subLabel}>Tự động fade giữa bài cũ và bài mới</Text>
                                </View>
                                <TouchableOpacity
                                  style={[styles.vinylToggleSwitch, transitionSettings.enabled && styles.vinylToggleSwitchActive]}
                                  onPress={() => updateTransitionSettings({ enabled: !transitionSettings.enabled })}
                                  activeOpacity={0.8}
                                >
                                  <View style={[styles.switchThumb, transitionSettings.enabled && styles.switchThumbActive]} />
                                </TouchableOpacity>
                              </View>

                              {/* THỜI LƯỢNG CHUYỂN BÀI (2s - 8s) */}
                              {transitionSettings.enabled && (
                                <>
                                  <View style={{ marginTop: 12, marginBottom: 6 }}>
                                    <Text style={styles.label}>Thời gian chuyển bài</Text>
                                    <Text style={styles.subLabel}>Tự động điều chỉnh theo nhịp điệu bài hát</Text>
                                  </View>
                                  <View style={styles.pillRow}>
                                    {([2, 3, 4, 5, 6, 8] as const).map((dur) => {
                                      const isSelected = transitionSettings.durationSec === dur;
                                      return (
                                        <TouchableOpacity
                                          key={dur}
                                          style={[styles.pillBtn, isSelected && styles.pillBtnActive]}
                                          onPress={() => updateTransitionSettings({ durationSec: dur })}
                                          activeOpacity={0.7}
                                        >
                                          <Text style={[styles.pillBtnText, isSelected && styles.pillBtnTextActive]}>
                                            {dur}s{dur === 4 ? ' ★' : ''}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>

                                  {/* CHẾ ĐỘ AN TOÀN (SAFE MODE) */}
                                  <View style={[styles.rowItem, { marginTop: 12 }]}>
                                    <View style={{ flex: 1, paddingRight: 8 }}>
                                      <Text style={styles.label}>Chế độ an toàn</Text>
                                      <Text style={styles.subLabel}>
                                        Giữ ổn định khi nghe trên màn hình khóa
                                      </Text>
                                    </View>
                                    <TouchableOpacity
                                      style={[styles.vinylToggleSwitch, transitionSettings.safeMode && styles.vinylToggleSwitchActive]}
                                      onPress={() => updateTransitionSettings({ safeMode: !transitionSettings.safeMode })}
                                      activeOpacity={0.8}
                                    >
                                      <View style={[styles.switchThumb, transitionSettings.safeMode && styles.switchThumbActive]} />
                                    </TouchableOpacity>
                                  </View>
                                </>
                              )}

                              {/* NÚT MỞ NHẬT KÝ CHẨN ĐOÁN (TRANSITION LOG) */}
                              <TouchableOpacity
                                style={styles.logLaunchBtn}
            <SettingRow
                                label="Nhật ký chuyển bài"
                                description="Xem chẩn đoán chi tiết các lần hòa âm thực tế"
                                showChevron
                                onPress={() => setTransitionLogModalVisible(true)}
                                activeOpacity={0.8}
                              >
                                <Text style={{ fontSize: 16 }}>🎛️</Text>
                                <Text style={styles.logLaunchBtnText}>
                                  Xem nhật ký chuyển bài
                                </Text>
                              </TouchableOpacity>
                            </View>
            />
                          </ListGroup>

                          {/* NÚT BẤM MỞ RỘNG/THU GỌN CÀI ĐẶT KỸ THUẬT DÀNH CHO DEVELOPER (ACCORDION) */}
                          <TouchableOpacity
                            style={styles.devAccordionToggle}
                            onPress={toggleDevSettings}
                            activeOpacity={0.7}
                          >
                            <View style={styles.devAccordionLeft}>
                              <View style={styles.devTagBadge}>
                                <Text style={styles.devTagBadgeText}>HỆ THỐNG</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.devAccordionTitle}>Cài đặt kỹ thuật & Máy chủ</Text>
                                <Text style={styles.devAccordionSubtitle}>
                                  Nhạc offline, Lịch sử nghe, Cloudflare Worker, ETag, Sideload
                                </Text>
                              </View>
                            </View>
                            <View style={[styles.statusToggleBadge, isDevSettingsOpen && styles.statusToggleBadgeActive]}>
                              <Text style={[styles.statusToggleBadgeText, isDevSettingsOpen && styles.statusToggleBadgeTextActive]}>
                                {isDevSettingsOpen ? 'Thu gọn' : 'Chi tiết'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                          {/* MỤC 4: BẬT / TẮT CHI TIẾT CÀI ĐẶT KỸ THUẬT */}
                          <SectionHeader title="HỆ THỐNG & KỸ THUẬT" />
                          <ListGroup>
                            <SettingRow
                              label={isDevSettingsOpen ? 'Thu gọn cài đặt kỹ thuật' : 'Xem cài đặt kỹ thuật & máy chủ'}
                              description="Dung lượng offline, đồng bộ Cloudflare Worker, ETag, Sideload"
                              showChevron
                              onPress={toggleDevSettings}
                            />
                          </ListGroup>

                          {/* CÁC PHẦN KỸ THUẬT (MẶC ĐỊNH THU GỌN VỚI HIỆU ỨNG ANIMATION CHUYỂN ĐỘNG MƯỢT MÀ) */}
                          {/* CÁC PHẦN KỸ THUẬT MỞ RỘNG (ACCORDION) */}
                          {isDevSettingsOpen && (
                            <>
                              {/* QUẢN LÝ DUNG LƯỢNG NHẠC NGOẠI TUYẾN (OFFLINE) */}
                              <View style={styles.sectionCard}>
                                <View style={styles.mysteryTitleRow}>
                                  <DownloadIcon size={20} color={colors.primary} />
                                  <Text style={[styles.sectionHeader, { color: colors.primary, marginBottom: 0 }]}>
                                    DUNG LƯỢNG NHẠC NGOẠI TUYẾN (OFFLINE)
                                  </Text>
                                </View>
                                <Text style={styles.sectionDesc}>
                                  Toàn bộ bài hát tải về được lưu trữ cục bộ an toàn trong thư mục tài liệu của app. Bạn có thể nghe bất cứ lúc nào mà không tốn dung lượng mạng:
                                </Text>

                                <View style={styles.rowItem}>
                                  <Text style={styles.label}>Tổng dung lượng đã chiếm</Text>
                                  <Text style={[styles.valueText, { color: colors.primary, fontWeight: fontWeights.bold }]}>
                                    {formatBytes(totalSizeBytes)}
                                  </Text>
                                </View>
                                <View style={styles.divider} />
                                <View style={styles.rowItem}>
                                  <Text style={styles.label}>Số bài hát đã lưu trữ</Text>
                                  <Text style={styles.valueText}>{offlineTracks.length} bài hát</Text>
                                </View>

                                <View style={[styles.actionRow, { marginTop: spacing.md }]}>
                                  <TouchableOpacity
                                    style={styles.primaryActionBtn}
              <SectionHeader title="LƯU TRỮ NGOẠI TUYẾN (OFFLINE)" />
                                  <ListGroup>
                                    <SettingRow
                                      label="Dung lượng đã chiếm"
                                      value={formatBytes(totalSizeBytes)}
                                    />
                                    <SettingRow
                                      label="Bài hát đã tải"
                                      value={`${offlineTracks.length} bài`}
                                    />
                                    <SettingRow
                                      label="Quản lý danh sách tải"
                                      description="Xem chi tiết, xóa từng bài hoặc nghe ngoại tuyến"
                                      showChevron
                                      onPress={() => {
                                        triggerSelectionHaptic();
                                        setOfflineModalVisible(true);
                                      }}
                                    />
                                    {offlineTracks.length > 0 && (
                                      <SettingRow
                                        label="Xóa tất cả nhạc ngoại tuyến"
                                        description={`Giải phóng ${formatBytes(totalSizeBytes)} bộ nhớ`}
                                        isDanger
                                        onPress={() => {
                                          Vibration.vibrate(10);
                                          setOfflineModalVisible(true);
                                          triggerSelectionHaptic();
                                          Alert.alert(
                                            'Xóa tất cả nhạc ngoại tuyến?',
                                            `Hành động này sẽ giải phóng toàn bộ ${formatBytes(totalSizeBytes)} bộ nhớ trên máy.`,
                                            [
                                              { text: 'Hủy', style: 'cancel' },
                                              {
                                                text: 'Xóa sạch',
                                                style: 'destructive',
                                                onPress: () => clearAllOffline(),
                                              },
                                            ]
                                          );
                                        }}
                                        activeOpacity={0.7}
                                      >
                                        <Text style={styles.primaryActionBtnText}>Quản lý bài đã tải</Text>
                                      </TouchableOpacity>
                                      />
                )}
                                  </ListGroup>

                                  {offlineTracks.length > 0 && (
                                    <TouchableOpacity
                                      style={[styles.secondaryActionBtn, { borderColor: colors.dangerBorder }]}
                                      onPress={() => {
                                        Vibration.vibrate(10);
                                        Alert.alert(
                                          'Xóa tất cả nhạc ngoại tuyến?',
                                          `Giải phóng toàn bộ ${formatBytes(totalSizeBytes)} bộ nhớ trên máy.`,
                                          [
                                            { text: 'Hủy', style: 'cancel' },
                                            {
                                              text: 'Xóa sạch',
                                              style: 'destructive',
                                              onPress: () => clearAllOffline(),
                                            },
                                          ]
                                        );
                                      }}
                                      activeOpacity={0.7}
                                    >
                                      <Text style={[styles.secondaryActionBtnText, { color: colors.dangerLight }]}>
                                        Xóa tất cả
                                      </Text>
                                    </TouchableOpacity>
                                  )}
                                  {/* TÙY CHỌN NGHE GẦN ĐÂY */}
                                  <SectionHeader title="LỊCH SỬ NGHE GẦN ĐÂY" />
                                  <ListGroup>
                                    <View style={styles.limitRowContainer}>
                                      <Text style={styles.limitLabel}>Số bài lưu tối đa</Text>
                                      <View style={styles.pillRow}>
                                        {([10, 20, 30, 40, 50] as const).map((limitOption) => {
                                          const isActive = recentLimit === limitOption;
                                          return (
                                            <TouchableOpacity
                                              key={limitOption}
                                              style={[styles.pillBtn, isActive && styles.pillBtnActive]}
                                              onPress={() => {
                                                triggerSelectionHaptic();
                                                setRecentLimit(limitOption);
                                              }}
                                              activeOpacity={0.7}
                                            >
                                              <Text style={[styles.pillBtnText, isActive && styles.pillBtnTextActive]}>
                                                {limitOption}
                                              </Text>
                                            </TouchableOpacity>
                                          );
                                        })}
                                      </View>
                                    </View>
                                </View>

                                {/* TÙY CHỌN NGHE GẦN ĐÂY (CHUYỂN VÀO PHẦN KỸ THUẬT & MÁY CHỦ) */}
                                <View style={styles.sectionCard}>
                                  <Text style={styles.sectionHeader}>NGHE GẦN ĐÂY (RECENTLY PLAYED)</Text>
                                  <Text style={styles.sectionDesc}>
                                    Tự động ghi nhận bài hát sau khi nghe tối thiểu 5 giây. Chọn số lượng bài tối đa được lưu lại:
                                  </Text>

                                  <View style={styles.pillRow}>
                                    {([10, 20, 30, 40, 50] as const).map((limitOption) => {
                                      const isActive = recentLimit === limitOption;
                                      return (
                                        <TouchableOpacity
                                          key={limitOption}
                                          style={[styles.pillBtn, isActive && styles.pillBtnActive]}
                                          onPress={() => {
                                            Vibration.vibrate(10);
                                            setRecentLimit(limitOption);
                                          }}
                                          activeOpacity={0.7}
                                        >
                                          <Text style={[styles.pillBtnText, isActive && styles.pillBtnTextActive]}>
                                            {limitOption}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>

                                  <TouchableOpacity
                                    style={[styles.secondaryActionBtn, { marginTop: spacing.md }]}
                                    {/* NÚT XÓA LỊCH SỬ DANGER CÓ ALERT XÁC NHẬN (Lỗi 8) */}
                <SettingRow
                                    label="Xóa toàn bộ lịch sử nghe"
                                    description="Làm trống danh sách bài hát vừa nghe"
                                    isDanger
                                    onPress={() => {
                                      Vibration.vibrate(10);
                                      triggerSelectionHaptic();
                                      Alert.alert(
                                        'Xóa lịch sử nghe gần đây?',
                                        'Toàn bộ danh sách bài hát vừa nghe sẽ được làm trống.',
                                        'Toàn bộ danh sách bài hát vừa nghe sẽ được làm trống. Dữ liệu này không thể khôi phục.',
                                        [
                                          { text: 'Hủy', style: 'cancel' },
                                          {
                                            text: 'Xóa ngay',
                                            style: 'destructive',
                                            onPress: () => clearRecentTracks(),
                                          },
                                        ]
                                      );
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={styles.secondaryActionBtnText}>Xóa toàn bộ lịch sử nghe</Text>
                                  </TouchableOpacity>
                                </View>
                                {/* PHẦN KỸ THUẬT 1: THÔNG TIN HỆ THỐNG & CHỨNG CHỈ */}
                                <View style={styles.sectionCard}>
                                  <Text style={styles.sectionHeader}>THÔNG TIN HỆ THỐNG & CHỨNG CHỈ</Text>
                />
                                </ListGroup>

                                <View style={styles.rowItem}>
                                  <Text style={styles.label}>Hạn chứng chỉ Sideload</Text>
                                  <Text style={styles.valueHighlight} numberOfLines={2}>
                                    {expirationDate || 'Không xác định'}
                                  </Text>
                                </View>
                                {/* THÔNG TIN HỆ THỐNG & CHỨNG CHỈ */}
                                <SectionHeader title="THÔNG TIN HỆ THỐNG & CHỨNG CHỈ" />
                                <ListGroup>
                                  <SettingRow
                                    label="Hạn chứng chỉ Sideload"
                                    value={expirationDate || 'Không xác định'}
                                  />
                                  <SettingRow
                                    label="Mã bản build (SHA)"
                                    value={buildSha.slice(0, 10)}
                                  />
                                  <SettingRow
                                    label="Nền tảng mục tiêu"
                                    value="iPhone 11 Pro Max (iOS 26+)"
                                  />
                                  <SettingRow
                                    label="Độ trễ chuyển bài (Gapless)"
                                    value={gaplessDeltaMs !== null ? `${gaplessDeltaMs} ms` : 'Chưa đo'}
                                  />
                                </ListGroup>

                                <View style={styles.divider} />

                                <View style={styles.rowItem}>
                                  <Text style={styles.label}>Mã bản build (SHA)</Text>
                                  <Text style={styles.valueCode}>{buildSha}</Text>
                                </View>

                                <View style={styles.divider} />

                                <View style={styles.rowItem}>
                                  <Text style={styles.label}>Nền tảng mục tiêu</Text>
                                  <Text style={styles.valueText}>iPhone 11 Pro Max (iOS 26+)</Text>
                                </View>

                                <View style={styles.divider} />

                                <View style={styles.rowItem}>
                                  <Text style={styles.label}>Độ trễ chuyển bài (Gapless Δt)</Text>
                                  <Text style={styles.valueText}>
                                    {gaplessDeltaMs !== null ? `${gaplessDeltaMs} ms` : 'Chưa đo'}
                                  </Text>
                                </View>
                              </View>

                              {/* PHẦN KỸ THUẬT 2: ĐỒNG BỘ NGẦM ETAG & BỘ NHỚ ĐỆM */}
                              <View style={styles.sectionCard}>
                                <Text style={styles.sectionHeader}>ĐỒNG BỘ NGẦM ETAG & BỘ NHỚ ĐỆM</Text>

                                <View style={styles.rowItem}>
                                  <Text style={styles.label}>Đồng bộ lần cuối</Text>
                                  <Text style={styles.valueText}>{formatDateTime(lastSyncTime)}</Text>
                                </View>

                                <View style={styles.divider} />

                                <View style={styles.rowItem}>
                                  <Text style={styles.label}>ETag thư viện R2</Text>
                                  <Text style={styles.valueCode} numberOfLines={1}>
                                    {currentEtag || 'Chưa nhận'}
                                  </Text>
                                </View>

                                <View style={styles.divider} />

                                <View style={styles.rowItem}>
                                  <Text style={styles.label}>Trạng thái ghi đĩa atomic</Text>
                                  <Text style={styles.valueText}>{atomicWriteBranch}</Text>
                                </View>

                                <View style={styles.divider} />

                                <View style={styles.rowItem}>
                                  <Text style={styles.label}>Khôi phục file hỏng</Text>
                                  <Text style={styles.valueText}>{recoveryStatus}</Text>
                                </View>

                                <View style={styles.divider} />

                                <View style={styles.rowItem}>
                                  <Text style={styles.label}>Hàng đợi ghi đĩa</Text>
                                  <Text style={styles.valueText} numberOfLines={1}>
                                    {writeQueueStatus}
                                  </Text>
                                </View>

                                {lastMoveError && (
                                  <>
                                    <View style={styles.divider} />
                                    <View style={styles.rowItem}>
                                      <Text style={[styles.label, { color: colors.danger }]}>Lỗi di chuyển file</Text>
                                      <Text style={[styles.valueText, { color: colors.danger }]} numberOfLines={2}>
                                        {lastMoveError}
                                      </Text>
                                    </View>
                                  </>
              {/* ĐỒNG BỘ ETAG & BỘ NHỚ ĐỆM */}
                                <SectionHeader title="ĐỒNG BỘ ETAG & BỘ NHỚ ĐỆM" />
                                <ListGroup>
                                  <SettingRow
                                    label="Đồng bộ lần cuối"
                                    value={formatDateTime(lastSyncTime)}
                                  />
                                  <SettingRow
                                    label="ETag thư viện R2"
                                    value={currentEtag ? currentEtag.slice(0, 16) : 'Chưa nhận'}
                                  />
                                  <SettingRow
                                    label="Ghi đĩa atomic"
                                    value={atomicWriteBranch}
                                  />
                                  <SettingRow
                                    label="Khôi phục file hỏng"
                                    value={recoveryStatus}
                                  />
                                  {Boolean(writeQueueStatus) && (
                                    <SettingRow
                                      label="Hàng đợi ghi đĩa"
                                      value={writeQueueStatus}
                                    />
                                  )}

                                  {lastSyncError && (
                                    <>
                                      <View style={styles.divider} />
                                      <View style={styles.rowItem}>
                                        <Text style={[styles.label, { color: colors.danger }]}>Lỗi đồng bộ gần nhất</Text>
                                        <Text style={[styles.valueText, { color: colors.danger }]} numberOfLines={2}>
                                          {lastSyncError}
                                        </Text>
                                      </View>
                                    </>
                {Boolean(lastMoveError) && (
                                    <SettingRow
                                      label="Lỗi di chuyển file"
                                      value={lastMoveError}
                                      isDanger
                                    />
                                  )}
                                  {Boolean(lastSyncError) && (
                                    <SettingRow
                                      label="Lỗi đồng bộ gần nhất"
                                      value={lastSyncError}
                                      isDanger
                                    />
                                  )}
                                  {Boolean(syncStatus) && (
                                    <SettingRow
                                      label="Trạng thái đồng bộ"
                                      value={syncStatus}
                                    />
                                  )}
                                  <SettingRow
                                    label="Kiểm tra bài mới (ETag)"
                                    description="Đồng bộ vi sai danh mục từ Cloudflare R2"
                                    onPress={handleSyncNow}
                                    disabled={isSyncing}
                                    rightElement={
                                      isSyncing ? (
                                        <ActivityIndicator size="small" color={tokens.colors.accent} />
                                      ) : undefined
                                    }
                                  />
                                  <SettingRow
                                    label="Xóa Cache & Tải lại"
                                    description="Xóa bộ nhớ đệm và nạp lại toàn bộ kho nhạc"
                                    onPress={handleClearCache}
                                    disabled={isSyncing}
                                  />
                                </ListGroup>

                                {syncStatus && (
                                  <View style={styles.statusBox}>
                                    <Text style={styles.statusText}>{syncStatus}</Text>
                                    {/* CẤU HÌNH MÁY CHỦ CLOUDFLARE */}
                                    <SectionHeader title="MÁY CHỦ CLOUDFLARE" />
                                    <ListGroup>
                                      <View style={styles.inputBox}>
                                        <Text style={styles.inputLabel}>Địa chỉ Cloudflare Worker (Server URL)</Text>
                                        <TextInput
                                          style={styles.textInput}
                                          value={inputUrl}
                                          onChangeText={setInputUrl}
                                          placeholder="https://beatify-api.worker.dev"
                                          placeholderTextColor={tokens.colors.textMuted}
                                          autoCapitalize="none"
                                          autoCorrect={false}
                                          keyboardType="url"
                                        />

                                        <View style={styles.tokenLabelRow}>
                                          <Text style={styles.inputLabel}>Khóa bảo mật (API Token)</Text>
                                          <TouchableOpacity
                                            onPress={() => setShowToken((prev) => !prev)}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                          >
                                            <Text style={styles.toggleTokenText}>{showToken ? 'Ẩn' : 'Hiện'}</Text>
                                          </TouchableOpacity>
                                        </View>
                )}
                                        <TextInput
                                          style={styles.textInput}
                                          value={inputToken}
                                          onChangeText={setInputToken}
                                          placeholder="Nhập token bảo mật..."
                                          placeholderTextColor={tokens.colors.textMuted}
                                          secureTextEntry={!showToken}
                                          autoCapitalize="none"
                                          autoCorrect={false}
                                        />

                                        {/* Cụm nút thao tác đồng bộ */}
                                        <View style={styles.actionRow}>
                                          <TouchableOpacity
                                            style={[styles.primaryActionBtn, isSyncing && styles.btnDisabled]}
                                            onPress={handleSyncNow}
                                            disabled={isSyncing}
                                            style={[styles.saveBtn, isSavingConfig && styles.btnDisabled]}
                                            onPress={handleSaveConfig}
                                            disabled={isSavingConfig}
                                            activeOpacity={0.7}
                                          >
                                            {isSyncing ? (
                                              <ActivityIndicator size="small" color={colors.textDark} />
                                            ) : (
                                              <Text style={styles.primaryActionBtnText}>Kiểm tra bài mới (ETag)</Text>
                                            )}
                                            <CheckIcon size={16} color="#000000" />
                                            <Text style={styles.saveBtnText}>Lưu cấu hình máy chủ</Text>
                                          </TouchableOpacity>
                                        </View>
                                    </ListGroup>

                                    {/* HÀNG PHÁT TRỰC TIẾP (STREAM URL) */}
                                    <SectionHeader title="PHÁT LIÊN KẾT TRỰC TIẾP" />
                                    <ListGroup>
                                      <View style={styles.inputBox}>
                                        <TextInput
                                          style={styles.textInput}
                                          value={customAudioUrl}
                                          onChangeText={setCustomAudioUrl}
                                          placeholder="https://example.com/audio.mp3"
                                          placeholderTextColor={tokens.colors.textMuted}
                                          autoCapitalize="none"
                                          autoCorrect={false}
                                          keyboardType="url"
                                        />
                                        <TouchableOpacity
                                          style={styles.secondaryActionBtn}
                                          onPress={handleClearCache}
                                          disabled={isSyncing}
                                          style={styles.mysteryAddBtn}
                                          onPress={handleAddCustomAudio}
                                          activeOpacity={0.7}
                                        >
                                          <Text style={styles.secondaryActionBtnText}>Xóa Cache & Tải lại</Text>
                                          <Text style={styles.mysteryAddBtnText}>+ Thêm vào hàng phát</Text>
                                        </TouchableOpacity>
                                      </View>
                                  </View>

              {/* PHẦN KỸ THUẬT 3: CẤU HÌNH MÁY CHỦ CLOUDFLARE */}
                                <View style={styles.sectionCard}>
                                  <Text style={styles.sectionHeader}>CẤU HÌNH MÁY CHỦ CLOUDFLARE</Text>
                                  <Text style={styles.sectionDesc}>
                                    App tự động nạp cấu hình khi quét mã QR từ Web Dashboard (beatify://connect). Bạn cũng có thể xem hoặc chỉnh sửa thủ công dưới đây:
                                  </Text>

                                  <Text style={styles.inputLabel}>Địa chỉ Cloudflare Worker (Server URL)</Text>
                                  <TextInput
                                    style={styles.textInput}
                                    value={inputUrl}
                                    onChangeText={setInputUrl}
                                    placeholder="https://beatify-api.worker.dev"
                                    placeholderTextColor={colors.textTertiary}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    keyboardType="url"
                                  />

                                  <View style={styles.tokenLabelRow}>
                                    <Text style={styles.inputLabel}>Khóa truy cập bảo mật (API Token)</Text>
                                    <TouchableOpacity onPress={() => setShowToken((prev) => !prev)}>
                                      <Text style={styles.toggleTokenText}>{showToken ? 'Ẩn' : 'Hiện'}</Text>
                                    </TouchableOpacity>
                                  </View>
                                  <TextInput
                                    style={styles.textInput}
                                    value={inputToken}
                                    onChangeText={setInputToken}
                                    placeholder="Nhập token bảo mật..."
                                    placeholderTextColor={colors.textTertiary}
                                    secureTextEntry={!showToken}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                  />

                                  <Text style={[styles.sectionDesc, { marginTop: spacing.xxs, color: colors.primary }]}>
                                    Token được mã hóa phần cứng và lưu an toàn trong iOS Keychain (Apple Secure Enclave).
                                  </Text>

                                  <TouchableOpacity
                                    style={[styles.saveBtn, isSavingConfig && styles.btnDisabled]}
                                    onPress={handleSaveConfig}
                                    disabled={isSavingConfig}
                                    activeOpacity={0.7}
                                  >
                                    <CheckIcon size={18} color={colors.textDark} />
                                    <Text style={styles.saveBtnText}>Lưu cấu hình máy chủ</Text>
                                  </TouchableOpacity>
                                </View>

                                {/* PHẦN KỸ THUẬT 4: HÀNG CHỜ BÍ MẬT (STREAM URL) */}
                                <View style={styles.sectionCard}>
                                  <View style={styles.mysteryTitleRow}>
                                    <MysteryIcon size={20} color={colors.warning} />
                                    <Text style={[styles.sectionHeader, { color: colors.warning, marginBottom: 0 }]}>
                                      HÀNG PHÁT BÍ MẬT (STREAM URL)
                                    </Text>
                                  </View>
                                  <Text style={styles.sectionDesc}>
                                    Dán liên kết âm thanh trực tiếp (MP3, AAC, FLAC) để stream bài hát tức thì mà không cần upload lên R2:
                                  </Text>

                                  <TextInput
                                    style={styles.textInput}
                                    value={customAudioUrl}
                                    onChangeText={setCustomAudioUrl}
                                    placeholder="https://example.com/audio.mp3"
                                    placeholderTextColor={colors.textTertiary}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    keyboardType="url"
                                  />

                                  <TouchableOpacity
                                    style={styles.mysteryAddBtn}
                                    onPress={handleAddCustomAudio}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={styles.mysteryAddBtnText}>+ Thêm vào hàng phát</Text>
                                  </TouchableOpacity>
                                </View>
                              </ListGroup>
                            </>
                          )}
                        </ScrollView>

                        {/* Modal Hồ sơ thống kê (ProfileModal) */}
                        <ProfileModal
                          visible={profileModalVisible}
                          onClose={() => setProfileModalVisible(false)}
                          totalLibraryTracksCount={tracks.length}
                          initialEditing={profileInitialEditing}
                          onProfileUpdated={(updated) => {
                            setUserProfile(updated);
                            onProfileUpdated?.(updated);
                          }}
                        />

                        {/* Modal Quản lý nhạc đã tải về máy (OfflineDownloadsModal) */}
                        <OfflineDownloadsModal
                          visible={offlineModalVisible}
                          onClose={() => setOfflineModalVisible(false)}
                        />

                        {/* Modal Xem Nhật ký chuyển bài (TransitionLogModal) */}
                        <TransitionLogModal
                          visible={transitionLogModalVisible}
                          onClose={() => setTransitionLogModalVisible(false)}
                        />
                      </View>
                    </Modal>
                    );
}

                    const styles = StyleSheet.create({
                      container: {
                      flex: 1,
                    backgroundColor: colors.background,
                    backgroundColor: tokens.colors.bgBase,
  },
                    profileHeaderCard: {
                      flexDirection: 'row',
                    grabberBox: {
                      alignItems: 'center',
                    backgroundColor: colors.surface,
                    padding: spacing.md,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: colors.surfaceHighlight,
                    marginBottom: spacing.xs,
                    paddingTop: 8,
                    paddingBottom: 4,
  },
                    profileHeaderMainTouch: {
                      flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    grabber: {
                      width: 36,
                    height: 5,
                    borderRadius: 2.5,
                    backgroundColor: tokens.colors.grabber,
  },
                    profileAvatarWrapper: {
                      width: 52,
                    height: 52,
                    borderRadius: 26,
                    overflow: 'hidden',
                    backgroundColor: colors.surfaceActive,
                    borderWidth: 2,
                    borderColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: spacing.md,
  },
                    profileAvatarImg: {
                      width: 52,
                    height: 52,
                    borderRadius: 26,
  },
                    profileAvatarPlaceholder: {
                      width: '100%',
                    height: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
  },
                    profileHeaderInfo: {
                      flex: 1,
  },
                    profileHeaderName: {
                      fontSize: fontSizes.titleSmall,
                    fontWeight: fontWeights.bold,
                    color: colors.textPrimary,
  },
                    profileHeaderBio: {
                      fontSize: fontSizes.captionLarge,
                    color: colors.textSecondary,
                    marginTop: 2,
  },
                    profileEditBadge: {
                      width: 32,
                    height: 32,
                    borderRadius: radius.pill,
                    backgroundColor: colors.surfaceSecondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: spacing.sm,
  },
                    header: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.md,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.borderDivider,
                    paddingHorizontal: tokens.spacing.lg,
                    paddingVertical: tokens.spacing.md,
                    borderBottomWidth: tokens.hairlineWidth,
                    borderBottomColor: tokens.colors.separator,
  },
                    headerTitle: {
                      color: colors.textPrimary,
                    fontSize: fontSizes.title,
                    fontWeight: fontWeights.bold,
                    ...tokens.typography.headline,
                    fontSize: 18,
  },
                    headerSubtitle: {
                      color: colors.textSecondary,
                    fontSize: fontSizes.caption,
                    marginTop: spacing.xxs,
  },
                    closeButton: {
                      width: 36,
                    height: 36,
                    borderRadius: radius.pill,
                    backgroundColor: colors.surfaceElevated,
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: tokens.colors.bgSurface,
                    justifyContent: 'center',
                    alignItems: 'center',
                    justifyContent: 'center',
  },
                    scrollContent: {
                      flex: 1,
  },
                    scrollInner: {
                      padding: spacing.lg,
                    gap: spacing.lg,
                    paddingTop: tokens.spacing.xs,
  },
                    sectionCard: {
                      backgroundColor: colors.surface,
                    borderRadius: radius.lg,
                    padding: spacing.lg,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
  },
                    sectionHeader: {
                      color: colors.textSecondary,
                    fontSize: fontSizes.caption,
                    fontWeight: fontWeights.bold,
                    letterSpacing: 0.8,
                    marginBottom: spacing.md,
  },
                    sectionDesc: {
                      color: colors.textSecondary,
                    fontSize: fontSizes.subhead,
                    lineHeight: lineHeights.caption,
                    marginBottom: spacing.md,
  },
                    rowItem: {
                      profileRow: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: spacing.xs,
                    paddingVertical: tokens.spacing.md,
                    paddingHorizontal: tokens.spacing.lg,
                    minHeight: 74,
  },
                    divider: {
                      height: 1,
                    backgroundColor: colors.borderDivider,
                    marginVertical: spacing.xs,
  },
                    label: {
                      color: colors.textSecondary,
                    fontSize: fontSizes.subhead,
                    profileTextCol: {
                      flex: 1,
  },
                    valueText: {
                      color: colors.textPrimary,
                    fontSize: fontSizes.subhead,
                    fontWeight: fontWeights.medium,
                    textAlign: 'right',
  },
                    valueHighlight: {
                      color: colors.primary,
                    fontSize: fontSizes.subhead,
                    fontWeight: fontWeights.bold,
                    textAlign: 'right',
                    flex: 1,
  },
                    valueCode: {
                      color: colors.primaryLight,
                    fontSize: fontSizes.caption,
                    fontFamily: 'Courier',
                    fontWeight: fontWeights.semibold,
                    textAlign: 'right',
  },
                    statusBox: {
                      backgroundColor: colors.surfaceElevated,
                    padding: spacing.sm,
                    borderRadius: radius.sm,
                    marginTop: spacing.md,
  },
                    statusText: {
                      color: colors.textSecondary,
                    fontSize: fontSizes.caption,
                    textAlign: 'center',
  },
                    actionRow: {
                      flexDirection: 'row',
                    gap: spacing.sm,
                    marginTop: spacing.md,
  },
                    primaryActionBtn: {
                      flex: 1,
                    backgroundColor: colors.primary,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    marginLeft: tokens.spacing.md,
                    justifyContent: 'center',
                    minHeight: 40,
  },
                    primaryActionBtnText: {
                      color: colors.textDark,
                    fontSize: fontSizes.subhead,
                    fontWeight: fontWeights.bold,
                    profileName: {
                      ...tokens.typography.headline,
                      fontSize: 17,
  },
                    secondaryActionBtn: {
                      flex: 1,
                    backgroundColor: colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 40,
                    profileSummary: {
                      ...tokens.typography.footnote,
                      color: tokens.colors.accent,
                    marginTop: 2,
                    fontWeight: '500',
  },
                    secondaryActionBtnText: {
                      color: colors.textPrimary,
                    fontSize: fontSizes.subhead,
                    fontWeight: fontWeights.semibold,
                    profileBio: {
                      ...tokens.typography.caption,
                      color: tokens.colors.textMuted,
                    marginTop: 2,
  },
                    btnDisabled: {
                      opacity: 0.6,
                    chevron: {
                      fontSize: 22,
                    fontWeight: '600',
                    color: tokens.colors.textDim,
                    marginLeft: tokens.spacing.xs,
  },
                    inputLabel: {
                      color: colors.textSecondary,
                    fontSize: fontSizes.caption,
                    fontWeight: fontWeights.semibold,
                    marginBottom: spacing.xs,
                    durationRowContainer: {
                      paddingVertical: tokens.spacing.md,
                    paddingHorizontal: tokens.spacing.lg,
  },
                    tokenLabelRow: {
                      flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: spacing.sm,
                    disabledSection: {
                      opacity: 0.35,
  },
                    toggleTokenText: {
                      color: colors.primary,
                    fontSize: fontSizes.caption,
                    fontWeight: fontWeights.bold,
                    durationHeader: {
                      marginBottom: tokens.spacing.sm,
  },
                    textInput: {
                      backgroundColor: colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    borderRadius: radius.md,
                    color: colors.textPrimary,
                    fontSize: fontSizes.body,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    marginBottom: spacing.sm,
                    durationLabel: {
                      ...tokens.typography.body,
                      fontSize: 15,
                    color: tokens.colors.textPrimary,
  },
                    saveBtn: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.xs,
                    backgroundColor: colors.primary,
                    borderRadius: radius.md,
                    paddingVertical: spacing.sm,
                    marginTop: spacing.xs,
                    minHeight: 42,
                    durationSubLabel: {
                      ...tokens.typography.footnote,
                      color: tokens.colors.textMuted,
                    marginTop: 2,
  },
                    saveBtnText: {
                      color: colors.textDark,
                    fontSize: fontSizes.subhead,
                    fontWeight: fontWeights.bold,
  },
                    profileBtn: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: colors.surfaceElevated,
                    padding: spacing.md,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
  },
                    profileBtnLeft: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
  },
                    profileIconCircle: {
                      width: 40,
                    height: 40,
                    borderRadius: radius.pill,
                    backgroundColor: colors.primaryMuted,
                    alignItems: 'center',
                    justifyContent: 'center',
  },
                    profileBtnTitle: {
                      color: colors.textPrimary,
                    fontSize: fontSizes.body,
                    fontWeight: fontWeights.bold,
  },
                    profileBtnSubtitle: {
                      color: colors.textSecondary,
                    fontSize: fontSizes.caption,
                    marginTop: spacing.xxs,
  },
                    chevronText: {
                      color: colors.textSecondary,
                    fontSize: fontSizes.titleLarge,
  },
                    mysteryTitleRow: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xs,
                    marginBottom: spacing.sm,
  },
                    mysteryAddBtn: {
                      backgroundColor: colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: colors.warning,
                    borderRadius: radius.md,
                    paddingVertical: spacing.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: spacing.xs,
                    minHeight: 40,
  },
                    mysteryAddBtnText: {
                      color: colors.warning,
                    fontSize: fontSizes.subhead,
                    fontWeight: fontWeights.bold,
  },
                    pillRow: {
                      flexDirection: 'row',
                    gap: spacing.xs,
                    marginTop: spacing.xs,
                    gap: tokens.spacing.sm,
                    marginTop: tokens.spacing.xs,
  },
                    pillBtn: {
                      flex: 1,
                    paddingVertical: spacing.sm,
                    backgroundColor: colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    borderRadius: radius.md,
                    minHeight: 36,
                    borderRadius: tokens.radius.pill,
                    backgroundColor: tokens.colors.bgElevated,
                    justifyContent: 'center',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 38,
                    borderWidth: tokens.hairlineWidth,
                    borderColor: tokens.colors.separator,
  },
                    pillBtnActive: {
                      backgroundColor: colors.primary,
                    borderColor: colors.primary,
                    backgroundColor: tokens.colors.accent,
                    borderColor: tokens.colors.accent,
  },
                    pillBtnText: {
                      color: colors.textSecondary,
                    fontSize: fontSizes.caption,
                    fontWeight: fontWeights.semibold,
                    ...tokens.typography.footnote,
                    fontWeight: '600',
                    color: tokens.colors.textSecondary,
  },
                    pillBtnTextActive: {
                      color: colors.textDark,
                    fontWeight: fontWeights.bold,
                    color: '#000000',
                    fontWeight: '700',
  },
                    devAccordionToggle: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: radius.lg,
                    padding: spacing.md,
                    marginBottom: spacing.md,
                    borderWidth: 1,
                    borderColor: colors.surfaceHighlight,
                    limitRowContainer: {
                      paddingVertical: tokens.spacing.md,
                    paddingHorizontal: tokens.spacing.lg,
  },
                    devAccordionLeft: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    flex: 1,
                    limitLabel: {
                      ...tokens.typography.body,
                      fontSize: 15,
                    color: tokens.colors.textPrimary,
                    marginBottom: tokens.spacing.xs,
  },
                    devTagBadge: {
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: radius.xs,
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.12)',
                    inputBox: {
                      padding: tokens.spacing.lg,
  },
                    devTagBadgeText: {
                      color: colors.textSecondary,
                    fontSize: 10,
                    fontWeight: fontWeights.bold,
                    letterSpacing: 0.5,
                    inputLabel: {
                      ...tokens.typography.caption,
                      color: tokens.colors.textMuted,
                    marginBottom: 6,
                    textTransform: 'uppercase',
  },
                    devAccordionTitle: {
                      color: colors.textPrimary,
                    fontSize: fontSizes.body,
                    fontWeight: fontWeights.bold,
                    textInput: {
                      ...tokens.typography.body,
                      backgroundColor: tokens.colors.bgElevated,
                    borderRadius: tokens.radius.card - 4,
                    paddingHorizontal: tokens.spacing.md,
                    paddingVertical: 10,
                    color: tokens.colors.textPrimary,
                    borderWidth: tokens.hairlineWidth,
                    borderColor: tokens.colors.separator,
                    marginBottom: tokens.spacing.md,
  },
                    devAccordionSubtitle: {
                      color: colors.textTertiary,
                    fontSize: fontSizes.caption,
                    marginTop: 2,
  },
                    statusToggleBadge: {
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
                    statusToggleBadgeActive: {
                      backgroundColor: colors.primaryMuted,
                    borderColor: colors.primary,
  },
                    statusToggleBadgeText: {
                      color: colors.textSecondary,
                    fontSize: fontSizes.caption,
                    fontWeight: fontWeights.semibold,
  },
                    statusToggleBadgeTextActive: {
                      color: colors.primary,
                    fontWeight: fontWeights.bold,
  },
                    personaBanner: {
                      tokenLabelRow: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(255, 215, 0, 0.08)',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 215, 0, 0.25)',
                    borderRadius: radius.md,
                    padding: spacing.sm,
                    gap: spacing.sm,
                    marginBottom: spacing.md,
  },
                    personaIconWrapper: {
                      width: 34,
                    height: 34,
                    borderRadius: radius.pill,
                    backgroundColor: 'rgba(255, 215, 0, 0.15)',
                    alignItems: 'center',
                    justifyContent: 'center',
  },
                    personaTitle: {
                      color: '#FFD700',
                    fontSize: fontSizes.subhead,
                    fontWeight: fontWeights.bold,
  },
                    personaDesc: {
                      color: colors.textSecondary,
                    fontSize: fontSizes.caption,
                    marginTop: 1,
  },
                    statsGrid: {
                      flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: spacing.xs,
                    justifyContent: 'space-between',
                    marginBottom: spacing.md,
  },
                    statTile: {
                      width: '48.5%',
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: radius.md,
                    padding: spacing.md,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    alignItems: 'center',
                    gap: spacing.xxs,
  },
                    statTileValue: {
                      color: colors.textPrimary,
                    fontSize: fontSizes.title,
                    fontWeight: fontWeights.bold,
                    marginTop: spacing.xxs,
                    toggleTokenText: {
                      ...tokens.typography.footnote,
                      color: tokens.colors.accent,
                    fontWeight: '600',
  },
                    statTileLabel: {
                      color: colors.textSecondary,
                    fontSize: fontSizes.caption,
  },
                    topHighlightsBox: {
                      backgroundColor: colors.surfaceElevated,
                    borderRadius: radius.md,
                    padding: spacing.md,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    marginBottom: spacing.md,
  },
                    highlightItem: {
                      gap: 2,
  },
                    highlightLabel: {
                      color: colors.textTertiary,
                    fontSize: fontSizes.caption,
                    fontWeight: fontWeights.semibold,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
  },
                    highlightValue: {
                      color: colors.textPrimary,
                    fontSize: fontSizes.subhead,
                    fontWeight: fontWeights.bold,
  },
                    highlightCount: {
                      color: colors.primary,
                    fontSize: fontSizes.caption,
                    fontWeight: fontWeights.semibold,
  },
                    detailStatsBtn: {
                      saveBtn: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: colors.surfaceSecondary,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
  },
                    detailStatsBtnText: {
                      color: colors.textPrimary,
                    fontSize: fontSizes.captionLarge,
                    fontWeight: fontWeights.semibold,
  },
                    streetRankBanner: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(29, 185, 84, 0.08)',
                    borderWidth: 1,
                    borderColor: 'rgba(29, 185, 84, 0.25)',
                    borderRadius: radius.md,
                    padding: spacing.sm,
                    gap: spacing.sm,
                    marginBottom: spacing.md,
  },
                    streetRankIconBox: {
                      width: 40,
                    height: 40,
                    borderRadius: radius.pill,
                    backgroundColor: 'rgba(29, 185, 84, 0.15)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: tokens.spacing.xs,
                    backgroundColor: tokens.colors.accent,
                    borderRadius: tokens.radius.pill,
                    minHeight: 44,
                    marginTop: tokens.spacing.xs,
  },
                    streetRankEmoji: {
                      fontSize: 22,
  },
                    streetRankTitleRow: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xs,
  },
                    streetRankTitle: {
                      color: colors.primary,
                    fontSize: fontSizes.body,
                    fontWeight: fontWeights.bold,
  },
                    streetRankLevelBadge: {
                      backgroundColor: colors.primary,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: radius.xs,
  },
                    streetRankLevelText: {
                      saveBtnText: {
                      ...tokens.typography.body,
                      color: '#000000',
                    fontSize: 9,
                    fontWeight: fontWeights.bold,
                    fontWeight: '700',
                    fontSize: 15,
  },
                    streetRankDesc: {
                      color: colors.textSecondary,
                    fontSize: fontSizes.caption,
                    marginTop: 2,
  },
                    subLabel: {
                      color: colors.textTertiary,
                    fontSize: fontSizes.caption,
                    marginTop: 2,
  },
                    vinylToggleSwitch: {
                      width: 48,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    padding: 2,
                    mysteryAddBtn: {
                      backgroundColor: tokens.colors.bgElevated,
                    borderRadius: tokens.radius.pill,
                    minHeight: 44,
                    justifyContent: 'center',
  },
                    vinylToggleSwitchActive: {
                      backgroundColor: colors.primary,
                    borderColor: colors.primary,
  },
                    switchThumb: {
                      width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: colors.textSecondary,
  },
                    switchThumbActive: {
                      backgroundColor: '#ffffff',
                    alignSelf: 'flex-end',
  },
                    sectionHeaderRow: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xs,
                    marginBottom: spacing.xs,
                    borderWidth: tokens.hairlineWidth,
                    borderColor: tokens.colors.separator,
  },
                    streetBadge: {
                      backgroundColor: '#064E3B',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    mysteryAddBtnText: {
                      ...tokens.typography.body,
                      color: tokens.colors.accent,
                    fontWeight: '600',
                    fontSize: 15,
  },
                    streetBadgeText: {
                      color: '#34D399',
                    fontSize: 9,
                    fontWeight: fontWeights.bold,
                    letterSpacing: 0.5,
                    btnDisabled: {
                      opacity: 0.5,
  },
                    logLaunchBtn: {
                      flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.xs,
                    backgroundColor: '#161618',
                    borderColor: '#262626',
                    borderWidth: 1,
                    borderRadius: radius.md,
                    paddingVertical: 10,
                    marginTop: 14,
  },
                    logLaunchBtnText: {
                      color: colors.primary,
                    fontSize: fontSizes.body,
});
