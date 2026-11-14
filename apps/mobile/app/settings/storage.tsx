import React from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../src/theme/tokens';
import { useOffline, usePlayer } from '../../src/context';
import { formatBytes } from '../../src/services/offline/offlineStorage';
import { ListGroup, SectionHeader, SettingRow } from '../../src/components/common';
import { triggerSelectionHaptic } from '../../src/utils/haptics';

export default function StorageSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { offlineTracks, totalSizeBytes, clearAllOffline } = useOffline();
  const { recentLimit, setRecentLimit, clearRecentTracks } = usePlayer();

  const handleClearAllOffline = () => {
    triggerSelectionHaptic();
    Alert.alert(
      'Xóa toàn bộ nhạc ngoại tuyến?',
      `Hành động này sẽ giải phóng toàn bộ ${formatBytes(totalSizeBytes)} bộ nhớ trên iPhone.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa tất cả',
          style: 'destructive',
          onPress: async () => {
            await clearAllOffline();
          },
        },
      ]
    );
  };

  const handleClearRecent = () => {
    triggerSelectionHaptic();
    Alert.alert(
      'Xóa lịch sử nghe gần đây?',
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
      {/* NHẠC NGOẠI TUYẾN (OFFLINE) */}
      <SectionHeader title="NHẠC NGOẠI TUYẾN (OFFLINE)" />
      <ListGroup>
        <SettingRow
          label="Dung lượng đã chiếm"
          value={formatBytes(totalSizeBytes)}
        />
        <SettingRow
          label="Bài hát đã lưu"
          value={`${offlineTracks.length} bài`}
        />
        {offlineTracks.length > 0 && (
          <SettingRow
            label="Xóa tất cả nhạc ngoại tuyến"
            description={`Giải phóng ${formatBytes(totalSizeBytes)} bộ nhớ máy`}
            isDanger
            onPress={handleClearAllOffline}
          />
        )}
      </ListGroup>

      {/* LỊCH SỬ NGHE GẦN ĐÂY */}
      <SectionHeader
        title="LỊCH SỬ NGHE GẦN ĐÂY"
        subtitle="Tự động ghi nhận bài hát sau khi nghe tối thiểu 5 giây"
      />
      <ListGroup>
        <View style={styles.limitBox}>
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

        <SettingRow
          label="Xóa toàn bộ lịch sử nghe"
          description="Làm trống danh sách bài hát vừa nghe"
          isDanger
          onPress={handleClearRecent}
        />
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
  limitBox: {
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
  },
  limitLabel: {
    ...tokens.typography.body,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    marginBottom: tokens.spacing.xs,
  },
  pillRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  pillBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: tokens.hairlineWidth,
    borderColor: tokens.colors.separator,
  },
  pillBtnActive: {
    backgroundColor: tokens.colors.accent,
    borderColor: tokens.colors.accent,
  },
  pillBtnText: {
    ...tokens.typography.footnote,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
  },
  pillBtnTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
});

