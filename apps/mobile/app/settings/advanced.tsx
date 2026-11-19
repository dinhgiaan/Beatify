import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../src/theme/tokens';
import { useLibrary, usePlayer } from '../../src/context';
import { ListGroup, SectionHeader, SettingRow, PressableScale } from '../../src/components/common';
import { CheckIcon } from '../../src/components/icons/SvgIcons';
import { triggerSelectionHaptic } from '../../src/utils/haptics';
import { getTabDebugLogs, clearTabDebugLogs } from '../../src/utils/debugLogger';
import {
  getHomeMetrics,
  isHomeDebug,
  setHomeDebug,
  analyzeListeningHistory,
  type ListeningHistoryDiagnostics,
} from '../../src/services/stats/homeMetrics';
import { statsStorage } from '../../src/services/stats/statsStorage';

export default function AdvancedSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
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
  } = usePlayer();

  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [inputToken, setInputToken] = useState(serverToken);
  const [showToken, setShowToken] = useState(false);
  const [customAudioUrl, setCustomAudioUrl] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  // C1 & C2: Hiệu năng Trang chủ & Chẩn đoán Lịch sử nghe
  const [homeMetrics, setHomeMetricsState] = useState(getHomeMetrics());
  const [isDebugHome, setIsDebugHome] = useState(isHomeDebug());
  const [historyDiag, setHistoryDiag] = useState<ListeningHistoryDiagnostics>({
    totalRecords: 0,
    skippedCount: 0,
    skippedPercent: 0,
    unfinalizedCount: 0,
    unfinalizedClusterPercent: 0,
  });

  useEffect(() => {
    setHomeMetricsState(getHomeMetrics());
    statsStorage.loadListeningRecords().then((records) => {
      setHistoryDiag(analyzeListeningHistory(records));
    });
  }, []);

  const handleToggleHomeDebug = (val: boolean) => {
    triggerSelectionHaptic();
    setHomeDebug(val);
    setIsDebugHome(val);
  };

  useEffect(() => {
    setInputUrl(serverUrl);
    setInputToken(serverToken);
  }, [serverUrl, serverToken]);

  const buildSha = process.env.EXPO_PUBLIC_BUILD_SHA || 'dev-local';

  const handleSaveConfig = () => {
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
    triggerSelectionHaptic();
    await syncLibrary({ silent: false, force: false });
  };

  const handleClearCache = () => {
    triggerSelectionHaptic();
    Alert.alert(
      'Xóa bộ nhớ đệm thư viện?',
      'Thao tác này sẽ xóa cache cục bộ và tải lại toàn bộ danh mục bài hát từ Cloudflare R2.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
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
    const url = customAudioUrl.trim();
    if (!url) {
      Alert.alert('Chưa nhập liên kết', 'Vui lòng dán liên kết âm thanh trực tiếp (http/https).');
      return;
    }
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

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return 'Chưa có';
    try {
      const d = new Date(iso);
      return d.toLocaleString('vi-VN');
    } catch {
      return iso;
    }
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
      <Animated.View entering={FadeIn.duration(180)} style={{ flex: 1 }}>
        {/* 1. NHẬT KÝ CHUYỂN BÀI (Chuyển vào nhóm Nâng cao) */}
        <View style={styles.sectionBlock}>
          <SectionHeader title="CHẨN ĐOÁN & NHẬT KÝ" variant="list" />
          <ListGroup>
            <SettingRow
              label="Nhật ký chuyển bài"
              description="Xem lịch sử hòa âm Smart Transition trên thiết bị"
              showChevron
              onPress={() => {
                triggerSelectionHaptic();
                router.push('/settings/transition-logs');
              }}
            />
          </ListGroup>
        </View>

        {/* 2. C1: HIỆU NĂNG TRANG CHỦ */}
        <View style={[styles.sectionBlock, styles.sectionSpaced]}>
          <SectionHeader title="HIỆU NĂNG TRANG CHỦ" variant="list" />
          <ListGroup>
            <SettingRow
              label="Thời gian tính gần nhất"
              value={homeMetrics.lastElapsedMs !== null ? `${homeMetrics.lastElapsedMs.toFixed(1)} ms` : 'Chưa đo'}
            />
            <SettingRow
              label="Số lượng section đề xuất"
              value={homeMetrics.lastElapsedMs !== null ? `${homeMetrics.sectionCount} danh mục` : 'Chưa có'}
            />
            <SettingRow
              label="Số bản ghi phân tích"
              value={homeMetrics.lastElapsedMs !== null ? `${homeMetrics.recordCount} bài nghe` : 'Chưa có'}
            />
            <SettingRow
              label="Ghi log chi tiết Trang chủ"
              description="In nhật ký buildHomeSections ra Console"
              isSwitch
              switchValue={isDebugHome}
              onSwitchChange={handleToggleHomeDebug}
            />
          </ListGroup>
        </View>

        {/* 3. C2: CHẨN ĐOÁN LỊCH SỬ NGHE */}
        <View style={[styles.sectionBlock, styles.sectionSpaced]}>
          <SectionHeader title="CHẨN ĐOÁN LỊCH SỬ NGHE" variant="list" />
          <ListGroup>
            <SettingRow
              label="Tổng số bản ghi nghe"
              value={`${historyDiag.totalRecords} lượt phát`}
            />
            <SettingRow
              label="Tỷ lệ nghe lướt (Skip < 25%)"
              description="Số bài dừng sớm trước 25% thời lượng"
              value={`${historyDiag.skippedPercent.toFixed(1)}% (${historyDiag.skippedCount})`}
            />
            <SettingRow
              label="Cụm chưa chốt (15s - 16s)"
              description="Số bài có thời lượng nghe trong khoảng 15s - 16s"
              value={`${historyDiag.unfinalizedClusterPercent.toFixed(1)}% (${historyDiag.unfinalizedCount})`}
            />
          </ListGroup>
        </View>

        {/* 4. THÔNG TIN HỆ THỐNG & CHỨNG CHỈ */}
        <View style={[styles.sectionBlock, styles.sectionSpaced]}>
          <SectionHeader title="HỆ THỐNG & CHỨNG CHỈ" variant="list" />
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
        </View>

        {/* 5. ĐỒNG BỘ ETAG & BỘ NHỚ ĐỆM */}
        <View style={[styles.sectionBlock, styles.sectionSpaced]}>
          <SectionHeader title="ĐỒNG BỘ ETAG & BỘ NHỚ ĐỆM" variant="list" />
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
        </View>

        {/* 6. CHẨN ĐOÁN & NHẬT KÝ TAB BAR */}
        <View style={[styles.sectionBlock, styles.sectionSpaced]}>
          <SectionHeader title="CHẨN ĐOÁN & NHẬT KÝ TAB BAR" variant="list" />
          <ListGroup>
            <SettingRow
              label="Sao chép / Chia sẻ Log Tab Bar"
              description="Lấy toàn bộ log layout & translateX để gửi chẩn đoán"
              onPress={() => {
                triggerSelectionHaptic();
                const logs = getTabDebugLogs();
                if (!logs) {
                  Alert.alert('Chưa có log', 'Hãy chuyển qua lại các tab ở màn hình chính trước để ghi nhận dữ liệu.');
                  return;
                }
                Share.share({ message: logs, title: 'Beatify TabBar Debug Logs' }).catch(() => {});
              }}
            />
            <SettingRow
              label="Xóa bộ nhớ Log Tab Bar"
              description="Làm sạch bộ nhớ đệm log để đo lại từ đầu"
              onPress={() => {
                triggerSelectionHaptic();
                clearTabDebugLogs();
                Alert.alert('Đã xóa', 'Bộ nhớ đệm log Tab Bar đã được làm sạch.');
              }}
            />
          </ListGroup>
        </View>

        {/* 7. CẤU HÌNH MÁY CHỦ CLOUDFLARE */}
        <View style={[styles.sectionBlock, styles.sectionSpaced]}>
          <SectionHeader title="MÁY CHỦ CLOUDFLARE" variant="list" />
          <ListGroup>
            <View style={styles.inputBox}>
              <Text style={styles.inputLabel}>Địa chỉ Cloudflare Worker (Server URL)</Text>
              <TextInput
                style={[
                  styles.textInput,
                  focusedInput === 'url' && styles.textInputFocused,
                ]}
                value={inputUrl}
                onChangeText={setInputUrl}
                onFocus={() => setFocusedInput('url')}
                onBlur={() => setFocusedInput(null)}
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
              <TextInput
                style={[
                  styles.textInput,
                  focusedInput === 'token' && styles.textInputFocused,
                ]}
                value={inputToken}
                onChangeText={setInputToken}
                onFocus={() => setFocusedInput('token')}
                onBlur={() => setFocusedInput(null)}
                placeholder="Nhập token bảo mật..."
                placeholderTextColor={tokens.colors.textMuted}
                secureTextEntry={!showToken}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <PressableScale
                style={[styles.saveBtn, isSavingConfig && styles.btnDisabled]}
                onPress={handleSaveConfig}
                disabled={isSavingConfig}
              >
                <CheckIcon size={16} color="#000000" />
                <Text style={styles.saveBtnText}>Lưu cấu hình máy chủ</Text>
              </PressableScale>
            </View>
          </ListGroup>
        </View>

        {/* 8. PHÁT LIÊN KẾT TRỰC TIẾP */}
        <View style={[styles.sectionBlock, styles.sectionSpaced]}>
          <SectionHeader title="PHÁT LIÊN KẾT TRỰC TIẾP" variant="list" />
          <ListGroup>
            <View style={styles.inputBox}>
              <Text style={styles.inputLabel}>Đường dẫn âm thanh trực tiếp (Audio URL)</Text>
              <TextInput
                style={[
                  styles.textInput,
                  focusedInput === 'audio' && styles.textInputFocused,
                ]}
                value={customAudioUrl}
                onChangeText={setCustomAudioUrl}
                onFocus={() => setFocusedInput('audio')}
                onBlur={() => setFocusedInput(null)}
                placeholder="https://example.com/audio.mp3"
                placeholderTextColor={tokens.colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <PressableScale
                style={styles.mysteryAddBtn}
                onPress={handleAddCustomAudio}
              >
                <Text style={styles.mysteryAddBtnText}>+ Thêm vào hàng phát</Text>
              </PressableScale>
            </View>
          </ListGroup>
        </View>
      </Animated.View>
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
  sectionBlock: {},
  sectionSpaced: {
    marginTop: 26,
  },
  inputBox: {
    padding: 18,
  },
  inputLabel: {
    ...tokens.typography.caption,
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  textInput: {
    ...tokens.typography.body,
    fontSize: 15,
    backgroundColor: tokens.colors.bgElevated,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
    color: tokens.colors.textPrimary,
    borderWidth: 1,
    borderColor: tokens.colors.separator,
    marginBottom: 16,
  },
  textInputFocused: {
    borderColor: tokens.colors.accent,
    backgroundColor: tokens.colors.bgSurface,
    borderWidth: 1.5,
  },
  tokenLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  toggleTokenText: {
    ...tokens.typography.footnote,
    color: tokens.colors.accent,
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    backgroundColor: tokens.colors.accent,
    borderRadius: tokens.radius.pill,
    minHeight: 46,
    marginTop: 6,
  },
  saveBtnText: {
    ...tokens.typography.body,
    color: '#000000',
    fontWeight: '700',
    fontSize: 15,
  },
  mysteryAddBtn: {
    backgroundColor: tokens.colors.bgElevated,
    borderRadius: tokens.radius.pill,
    minHeight: 46,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.colors.separator,
    marginTop: 2,
  },
  mysteryAddBtnText: {
    ...tokens.typography.body,
    color: tokens.colors.accent,
    fontWeight: '600',
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});

