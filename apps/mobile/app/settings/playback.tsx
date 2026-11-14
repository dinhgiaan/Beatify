import React from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../src/theme/tokens';
import { usePlayer } from '../../src/context';
import { ListGroup, SectionHeader, SettingRow } from '../../src/components/common';
import { triggerSelectionHaptic } from '../../src/utils/haptics';

export default function PlaybackSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    isVinylMode,
    toggleVinylMode,
    transitionSettings,
    updateTransitionSettings,
  } = usePlayer();

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
      {/* ĐĨA THAN VINYL */}
      <SectionHeader title="ĐĨA THAN VINYL" />
      <ListGroup>
        <SettingRow
          label="Chế độ đĩa than 360°"
          description="Cần kim tonearm và hiệu ứng xoay 33⅓ RPM trên màn hình đang phát (Now Playing)"
          isSwitch
          switchValue={isVinylMode}
          onSwitchChange={toggleVinylMode}
        />
      </ListGroup>

      {/* CHUYỂN BÀI THÔNG MINH */}
      <SectionHeader
        title="CHUYỂN BÀI THÔNG MINH"
        subtitle="Hòa âm fade âm lượng mượt mà giữa hai bài hát liên tiếp"
      />
      <ListGroup>
        <SettingRow
          label="Kích hoạt chuyển bài"
          description="Tự động fade âm lượng giữa bài cũ và bài mới"
          isSwitch
          switchValue={transitionSettings.enabled}
          onSwitchChange={(val) => updateTransitionSettings({ enabled: val })}
        />

        {/* Chip thời gian: mờ khi Switch tắt */}
        <View
          style={[
            styles.durationContainer,
            !transitionSettings.enabled && styles.durationDisabled,
          ]}
        >
          <View style={styles.durationHeader}>
            <Text style={styles.durationLabel}>Thời gian chuyển bài</Text>
            <Text style={styles.durationSubLabel}>
              Hòa âm mượt mà giữa hai bài hát liên tiếp
            </Text>
          </View>

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
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <SettingRow
          label="Chế độ an toàn (Safe Mode)"
          description="Giữ ổn định khi nghe nhạc trên màn hình khóa"
          isSwitch
          disabled={!transitionSettings.enabled}
          switchValue={transitionSettings.safeMode}
          onSwitchChange={(val) => updateTransitionSettings({ safeMode: val })}
        />

        <SettingRow
          label="Xem nhật ký chuyển bài"
          description="Chẩn đoán chi tiết các lần hòa âm thực tế trên máy"
          showChevron
          onPress={() => {
            triggerSelectionHaptic();
            router.push('/settings/transition-logs');
          }}
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
  durationContainer: {
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
  },
  durationDisabled: {
    opacity: 0.35,
  },
  durationHeader: {
    marginBottom: tokens.spacing.sm,
  },
  durationLabel: {
    ...tokens.typography.body,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  durationSubLabel: {
    ...tokens.typography.footnote,
    color: tokens.colors.textMuted,
    marginTop: 2,
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

