import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../src/theme/tokens';
import { useLibrary, usePlayer } from '../../src/context';
import { ListGroup, SectionHeader, SettingRow } from '../../src/components/common';
import { CheckIcon } from '../../src/components/icons/SvgIcons';
import { triggerSelectionHaptic } from '../../src/utils/haptics';

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
      {/* NHẬT KÝ CHUYỂN BÀI (Chuyển vào nhóm Nâng cao) */}
      <SectionHeader title="CHẨN ĐOÁN & NHẬT KÝ" />
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

      {/* THÔNG TIN HỆ THỐNG & CHỨNG CHỈ */}
      <SectionHeader title="HỆ THỐNG & CHỨNG CHỈ" />
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

          <TouchableOpacity
            style={[styles.saveBtn, isSavingConfig && styles.btnDisabled]}
            onPress={handleSaveConfig}
            disabled={isSavingConfig}
            activeOpacity={0.7}
          >
            <CheckIcon size={16} color="#000000" />
            <Text style={styles.saveBtnText}>Lưu cấu hình máy chủ</Text>
          </TouchableOpacity>
        </View>
      </ListGroup>

      {/* PHÁT LIÊN KẾT TRỰC TIẾP */}
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
            style={styles.mysteryAddBtn}
            onPress={handleAddCustomAudio}
            activeOpacity={0.7}
          >
            <Text style={styles.mysteryAddBtnText}>+ Thêm vào hàng phát</Text>
          </TouchableOpacity>
        </View>
      </ListGroup>
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
  inputBox: {
    padding: tokens.spacing.lg,
  },
  inputLabel: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
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
  tokenLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    minHeight: 44,
    marginTop: tokens.spacing.xs,
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
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: tokens.hairlineWidth,
    borderColor: tokens.colors.separator,
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

