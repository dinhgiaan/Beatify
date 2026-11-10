import React, { useState } from 'react';
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
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  colors,
  spacing,
  radius,
  fontSizes,
  fontWeights,
  lineHeights,
} from '../theme';
import { useLibrary, usePlayer, useOffline } from '../context';
import { ProfileModal } from './ProfileModal';
import { OfflineDownloadsModal } from './OfflineDownloadsModal';
import { formatBytes } from '../services/offline/offlineStorage';
import {
  CloseIcon,
  ProfileIcon,
  MysteryIcon,
  CheckIcon,
  DownloadIcon,
} from './icons/SvgIcons';

interface HiddenSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function HiddenSettingsModal({ visible, onClose }: HiddenSettingsModalProps) {
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
  } = usePlayer();

  const { offlineTracks, totalSizeBytes, clearAllOffline } = useOffline();

  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [inputToken, setInputToken] = useState(serverToken);
  const [showToken, setShowToken] = useState(false);
  const [customAudioUrl, setCustomAudioUrl] = useState('');
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [offlineModalVisible, setOfflineModalVisible] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const buildSha = process.env.EXPO_PUBLIC_BUILD_SHA || 'dev-local';

  const handleSaveConfig = () => {
    Vibration.vibrate(10);
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
    await syncLibrary({ silent: false, force: false });
  };

  const handleClearCache = () => {
    Vibration.vibrate(10);
    Alert.alert(
      'Xóa bộ nhớ đệm thư viện?',
      'Hành động này sẽ xóa file cache cục bộ trên điện thoại và tải lại toàn bộ danh sách bài hát mới nhất từ Cloudflare R2.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa & Tải lại',
          style: 'destructive',
          onPress: async () => {
            await clearLibraryCache();
          },
        },
      ]
    );
  };

  const handleAddCustomAudio = async () => {
    const trimmed = customAudioUrl.trim();
    if (!trimmed) {
      Alert.alert('Chưa nhập liên kết', 'Vui lòng dán liên kết audio hợp lệ (MP3, AAC, FLAC...)');
      return;
    }
    Vibration.vibrate(10);
    await addCustomTrack(trimmed);
    setCustomAudioUrl('');
    Alert.alert('Thành công', 'Đã thêm bài hát bí mật vào hàng phát hiện tại!');
  };

  const formatDateTime = (iso: string | null) => {
    if (!iso) return 'Chưa đồng bộ';
    try {
      const d = new Date(iso);
      return d.toLocaleString('vi-VN');
    } catch {
      return iso;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: Math.max(insets.top, spacing.md) }]}>
        {/* Header Modal */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Cài đặt ẩn & Kỹ thuật</Text>
            <Text style={styles.headerSubtitle}>Beatify Engine • Quản trị hệ thống</Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Đóng cài đặt ẩn"
          >
            <CloseIcon size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={[
            styles.scrollInner,
            { paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* PHẦN 1: THÔNG TIN HỆ THỐNG & CHỨNG CHỈ */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>THÔNG TIN HỆ THỐNG & CHỨNG CHỈ</Text>

            <View style={styles.rowItem}>
              <Text style={styles.label}>Hạn chứng chỉ Sideload</Text>
              <Text style={styles.valueHighlight} numberOfLines={2}>
                {expirationDate || 'Không xác định'}
              </Text>
            </View>

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

          {/* PHẦN 2: ĐỒNG BỘ NGẦM ETAG & BỘ NHỚ ĐỆM */}
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
            )}

            {syncStatus && (
              <View style={styles.statusBox}>
                <Text style={styles.statusText}>{syncStatus}</Text>
              </View>
            )}

            {/* Cụm nút thao tác đồng bộ */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.primaryActionBtn, isSyncing && styles.btnDisabled]}
                onPress={handleSyncNow}
                disabled={isSyncing}
                activeOpacity={0.7}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color={colors.textDark} />
                ) : (
                  <Text style={styles.primaryActionBtnText}>Kiểm tra bài mới (ETag)</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryActionBtn}
                onPress={handleClearCache}
                disabled={isSyncing}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryActionBtnText}>Xóa Cache & Tải lại</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* PHẦN 3: CẤU HÌNH MÁY CHỦ (ZERO-CONFIG) */}
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

          {/* PHẦN 4: HỒ SƠ & THỐNG KÊ NGHE NHẠC */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>HỒ SƠ & THỐNG KÊ REPLAY</Text>
            <Text style={styles.sectionDesc}>
              Xem phân tích thời gian nghe, các bài hát và nghệ sĩ được nghe nhiều nhất, danh hiệu và Replay cá nhân.
            </Text>

            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => setProfileModalVisible(true)}
              activeOpacity={0.7}
            >
              <View style={styles.profileBtnLeft}>
                <View style={styles.profileIconCircle}>
                  <ProfileIcon size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.profileBtnTitle}>Mở Hồ sơ & Thống kê</Text>
                  <Text style={styles.profileBtnSubtitle}>
                    {tracks.length} bài hát trong thư viện
                  </Text>
                </View>
              </View>
              <Text style={styles.chevronText}>→</Text>
            </TouchableOpacity>
          </View>

          {/* PHẦN 5: TÙY CHỌN NGHE GẦN ĐÂY */}
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
              onPress={() => {
                Vibration.vibrate(10);
                Alert.alert(
                  'Xóa lịch sử nghe gần đây?',
                  'Toàn bộ danh sách bài hát vừa nghe sẽ được làm trống.',
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

          {/* PHẦN 6: QUẢN LÝ DUNG LƯỢNG NHẠC NGOẠI TUYẾN (OFFLINE) */}
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
                onPress={() => {
                  Vibration.vibrate(10);
                  setOfflineModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.primaryActionBtnText}>Quản lý bài đã tải</Text>
              </TouchableOpacity>

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
            </View>
          </View>

          {/* PHẦN 5: HÀNG CHỜ BÍ MẬT (CUSTOM AUDIO URL) */}
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
        </ScrollView>

        {/* Modal Hồ sơ thống kê (ProfileModal) */}
        <ProfileModal
          visible={profileModalVisible}
          onClose={() => setProfileModalVisible(false)}
          totalLibraryTracksCount={tracks.length}
        />

        {/* Modal Quản lý nhạc đã tải về máy (OfflineDownloadsModal) */}
        <OfflineDownloadsModal
          visible={offlineModalVisible}
          onClose={() => setOfflineModalVisible(false)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDivider,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: spacing.lg,
    gap: spacing.lg,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderDivider,
    marginVertical: spacing.xs,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSizes.subhead,
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
    justifyContent: 'center',
    minHeight: 40,
  },
  primaryActionBtnText: {
    color: colors.textDark,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
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
  },
  secondaryActionBtnText: {
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.semibold,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.xs,
  },
  tokenLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  toggleTokenText: {
    color: colors.primary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
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
  },
  pillBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  pillBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillBtnText: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  pillBtnTextActive: {
    color: colors.textDark,
    fontWeight: fontWeights.bold,
  },
});
